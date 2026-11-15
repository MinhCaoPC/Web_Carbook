// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./QuanLyChuyenXe.sol";

/**
 * @title VeXeNFT
 * @notice Mỗi vé xe CARBOOK là MỘT NFT chuẩn ERC-721, nằm trong ví MetaMask của khách.
 *
 * 6 chức năng chính (khớp đề bài):
 *   1. (Firebase) Xem tuyến, chuyến, sơ đồ ghế      -> không nằm ở đây
 *   2. muaVe / muaNhieuVe   : khách trả ETH, hợp đồng mint NFT vé vào ví khách
 *   3. _gheDaBan + sơ đồ ghế : KHÓA GHẾ trên blockchain, chỉ bán ghế có thật, mỗi ghế chỉ bán một lần
 *   4. danhDauDaSuDung      : soát vé (QR điện thoại hoặc vé in) — kiểm tra CHỦ SỞ HỮU (chữ ký) + TRẠNG THÁI, rồi đánh dấu đã dùng
 *   5. huyVe                : hủy vé, HOÀN TIỀN theo mốc thời gian ghi cứng trong hợp đồng
 *   6. chuyenNhuongVe / raoBanVe / muaLaiVe : chuyển nhượng, bán lại có GIÁ TRẦN
 *
 * Dữ liệu ON-CHAIN: ai sở hữu vé, ghế nào đã bán, trạng thái vé (Hiệu lực / Đã dùng / Đã hủy).
 */
contract VeXeNFT is ERC721Enumerable, QuanLyChuyenXe, ReentrancyGuard {
    // ===================== LUẬT CỦA HỢP ĐỒNG =====================

    // Luật hoàn tiền khi hủy vé (chức năng 5)
    uint64 public constant MOC_HOAN_NHIEU = 24 hours; // hủy trước giờ chạy >= 24 giờ -> hoàn 90%
    uint64 public constant MOC_HOAN_IT = 2 hours;     // hủy trước giờ chạy từ 2 đến 24 giờ -> hoàn 50%
    uint256 public constant PHAN_TRAM_HOAN_NHIEU = 90; // dưới 2 giờ -> KHÔNG được hủy
    uint256 public constant PHAN_TRAM_HOAN_IT = 50;

    // Luật chuyển nhượng / bán lại (chức năng 6)
    uint256 public constant GIA_TRAN_PHAN_TRAM = 110;  // giá bán lại tối đa 110% giá gốc (chống phe vé)
    uint64 public constant KHOA_CHUYEN_NHUONG = 2 hours; // còn dưới 2 giờ trước giờ chạy thì khóa


    // ===================== DỮ LIỆU VÉ =====================

    enum TrangThaiVe {
        HieuLuc,  // 0: còn dùng được
        DaSuDung, // 1: đã lên xe
        DaHuy     // 2: đã hủy, đã hoàn tiền
    }

    struct Ve {
        string maChuyen;      // vd "CX001_2026-11-12"
        string maGhe;         // vd "A01"
        uint256 giaGoc;       // số wei khách trả lúc mua lần đầu
        uint64 gioKhoiHanh;   // chép từ chuyến lúc mua
        TrangThaiVe trangThai;
    }

    mapping(uint256 => Ve) private _ve;                // mã vé (tokenId) -> thông tin vé
    mapping(bytes32 => uint256) private _gheDaBan;     // keccak(mã chuyến, mã ghế) -> mã vé (0 = ghế trống)
    mapping(bytes32 => uint16) public soVeDaBan;       // id chuyến -> số vé đang giữ chỗ
    mapping(uint256 => uint256) public giaRaoBan;      // mã vé -> giá đang rao (0 = không rao)
    mapping(uint256 => bool) public daTinhDoanhThu;    // vé đã được cộng vào doanh thu nhà xe chưa (tránh cộng hai lần)

    uint256 public tongSoVeDaPhatHanh; // cũng là mã vé lớn nhất (mã vé bắt đầu từ 1)
    uint256 public doanhThuChoRut;     // tiền nhà xe được phép rút về
    string private _duongDanMetadata;  // vd "http://localhost:5050/api/metadata/"

    // ===================== SỰ KIỆN =====================

    event DaMuaVe(uint256 indexed maVe, address indexed nguoiMua, string maChuyen, string maGhe, uint256 gia);
    event DaSuDungVe(uint256 indexed maVe, address indexed nhanVien);
    event DaHuyVe(uint256 indexed maVe, address indexed chuVe, uint256 tienHoan);
    event DaChuyenNhuong(uint256 indexed maVe, address indexed tu, address indexed den);
    event DaRaoBan(uint256 indexed maVe, uint256 gia);
    event DaHuyRaoBan(uint256 indexed maVe);
    event DaBanLai(uint256 indexed maVe, address indexed nguoiBan, address indexed nguoiMua, uint256 gia);
    event DaRutDoanhThu(address den, uint256 soTien);
    event DaChotVeKhongDi(uint256 indexed maVe, uint256 soTien);

    constructor(string memory duongDanMetadata) ERC721("Ve Xe CARBOOK", "VEXE") {
        _duongDanMetadata = duongDanMetadata;
    }

    modifier chiChuVe(uint256 maVe) {
        require(_ownerOf(maVe) == msg.sender, "Ban khong phai chu ve");
        _;
    }

    // ============ CHỨC NĂNG 2 + 3: MUA VÉ & KHÓA GHẾ ============

    /// Mua 1 vé. Gửi kèm đúng `giaVe` của chuyến (msg.value).
    function muaVe(string calldata maChuyen, string calldata maGhe) external payable nonReentrant returns (uint256) {
        ChuyenXe memory chuyen = layChuyen(maChuyen);
        require(msg.value == chuyen.giaVe, "So tien gui khong dung gia ve");
        return _phatHanhVe(maChuyen, maGhe, chuyen);
    }

    /// Mua nhiều ghế cùng chuyến trong một giao dịch. Gửi kèm giaVe x số ghế.
    function muaNhieuVe(string calldata maChuyen, string[] calldata danhSachGhe) external payable nonReentrant {
        require(danhSachGhe.length > 0 && danhSachGhe.length <= 5, "Moi lan mua tu 1 den 5 ve");
        ChuyenXe memory chuyen = layChuyen(maChuyen);
        require(msg.value == chuyen.giaVe * danhSachGhe.length, "So tien gui khong dung gia ve");
        for (uint256 i = 0; i < danhSachGhe.length; i++) {
            _phatHanhVe(maChuyen, danhSachGhe[i], chuyen);
        }
    }

    /// Kiểm tra mọi điều kiện, khóa ghế rồi mint NFT vào ví người mua.
    function _phatHanhVe(string calldata maChuyen, string calldata maGhe, ChuyenXe memory chuyen) private returns (uint256 maVe) {
        require(chuyen.dangMoBan, "Chuyen chua mo ban");
        require(block.timestamp < chuyen.gioKhoiHanh, "Chuyen da khoi hanh");
        require(gheCoTrenXe(maChuyen, maGhe), "Ghe khong co tren xe nay"); // chỉ bán ghế có thật trong sơ đồ

        bytes32 idChuyen = layIdChuyen(maChuyen);
        bytes32 khoaGhe = _khoaGhe(maChuyen, maGhe);
        require(_gheDaBan[khoaGhe] == 0, "Ghe da co nguoi mua");      // <- KHÓA GHẾ: không bán trùng
        require(soVeDaBan[idChuyen] < chuyen.soGhe, "Chuyen da het ghe");

        maVe = ++tongSoVeDaPhatHanh;
        _gheDaBan[khoaGhe] = maVe;
        soVeDaBan[idChuyen] += 1;
        _ve[maVe] = Ve(maChuyen, maGhe, chuyen.giaVe, chuyen.gioKhoiHanh, TrangThaiVe.HieuLuc);

        _safeMint(msg.sender, maVe); // NFT vào thẳng ví MetaMask của khách
        emit DaMuaVe(maVe, msg.sender, maChuyen, maGhe, chuyen.giaVe);
    }

    // ============ CHỨC NĂNG 4: SOÁT VÉ ============

    /// Câu khách ký bằng MetaMask để chứng minh mình là chủ vé. Mã QR (trên điện thoại hoặc in giấy) = { maVe, chuKy }.
    /// QR KHÔNG có hạn: vé chỉ hết hiệu lực khi đã lên xe (hoặc bị hủy).
    function noiDungCanKy(uint256 maVe) public pure returns (string memory) {
        return string.concat("CARBOOK - Xac nhan chu ve #", Strings.toString(maVe));
    }

    /// Ví đã ký `noiDungCanKy(maVe)` -> trả về địa chỉ ví đó.
    function layNguoiKy(uint256 maVe, bytes calldata chuKy) public pure returns (address) {
        bytes32 bam = MessageHashUtils.toEthSignedMessageHash(bytes(noiDungCanKy(maVe)));
        return ECDSA.recover(bam, chuKy);
    }

    /// Nhân viên quét QR -> gọi hàm này. Hợp đồng tự kiểm tra:
    ///  (a) người ký QR đúng là chủ NFT hiện tại -> QR / vé in của người đã bán, đã tặng vé bị từ chối
    ///  (b) vé còn hiệu lực (chưa dùng, chưa hủy) -> mỗi vé chỉ lên xe được MỘT lần (bản chụp, bản photo vô dụng sau đó)
    function danhDauDaSuDung(uint256 maVe, bytes calldata chuKy) external chiNhanVienSoatVe {
        address chuVe = _ownerOf(maVe);
        require(chuVe != address(0), "Ve khong ton tai");
        require(layNguoiKy(maVe, chuKy) == chuVe, "Chu ky khong phai cua chu ve");
        require(_ve[maVe].trangThai == TrangThaiVe.HieuLuc, "Ve khong con hieu luc");

        _ve[maVe].trangThai = TrangThaiVe.DaSuDung;
        delete giaRaoBan[maVe];
        _ghiDoanhThu(maVe, _ve[maVe].giaGoc); // khách đã đi -> nhà xe được nhận tiền vé
        emit DaSuDungVe(maVe, msg.sender);
    }

    // ============ CHỨC NĂNG 5: HỦY VÉ & HOÀN TIỀN ============

    /// Xem trước: hủy lúc này thì được hoàn bao nhiêu phần trăm, bao nhiêu wei. phanTram = 0 nghĩa là không hủy được.
    function tinhTienHoan(uint256 maVe) public view returns (uint256 phanTram, uint256 tienHoan) {
        Ve storage ve = _ve[maVe];
        if (_ownerOf(maVe) == address(0) || ve.trangThai != TrangThaiVe.HieuLuc) return (0, 0);

        if (block.timestamp + MOC_HOAN_NHIEU <= ve.gioKhoiHanh) phanTram = PHAN_TRAM_HOAN_NHIEU;
        else if (block.timestamp + MOC_HOAN_IT <= ve.gioKhoiHanh) phanTram = PHAN_TRAM_HOAN_IT;
        else phanTram = 0;

        tienHoan = (ve.giaGoc * phanTram) / 100;
    }

    /// Chủ vé hủy vé: NFT bị đốt, ghế được mở lại, tiền hoàn chuyển thẳng về ví.
    function huyVe(uint256 maVe) external nonReentrant chiChuVe(maVe) {
        (uint256 phanTram, uint256 tienHoan) = tinhTienHoan(maVe);
        require(phanTram > 0, "Qua sat gio chay, khong the huy ve");

        Ve storage ve = _ve[maVe];
        ve.trangThai = TrangThaiVe.DaHuy;
        delete giaRaoBan[maVe];
        delete _gheDaBan[_khoaGhe(ve.maChuyen, ve.maGhe)]; // mở lại ghế cho người khác mua
        soVeDaBan[layIdChuyen(ve.maChuyen)] -= 1;
        _ghiDoanhThu(maVe, ve.giaGoc - tienHoan);          // phần giữ lại là phí hủy của nhà xe

        _burn(maVe); // vé hủy thì không còn ai sở hữu
        _guiTien(msg.sender, tienHoan);
        emit DaHuyVe(maVe, msg.sender, tienHoan);
    }

    // ============ CHỨC NĂNG 6: CHUYỂN NHƯỢNG & BÁN LẠI ============

    /// Vé còn chuyển nhượng/bán lại được không: còn hiệu lực và còn hơn 2 giờ mới tới giờ chạy.
    function coTheChuyenNhuong(uint256 maVe) public view returns (bool) {
        if (_ownerOf(maVe) == address(0)) return false;
        Ve storage ve = _ve[maVe];
        return ve.trangThai == TrangThaiVe.HieuLuc && block.timestamp + KHOA_CHUYEN_NHUONG < ve.gioKhoiHanh;
    }

    function giaBanLaiToiDa(uint256 maVe) public view returns (uint256) {
        return (_ve[maVe].giaGoc * GIA_TRAN_PHAN_TRAM) / 100;
    }

    /// Tặng / chuyển vé cho người khác (miễn phí).
    function chuyenNhuongVe(uint256 maVe, address nguoiNhan) external chiChuVe(maVe) {
        require(nguoiNhan != address(0) && nguoiNhan != msg.sender, "Nguoi nhan khong hop le");
        require(coTheChuyenNhuong(maVe), "Ve khong the chuyen nhuong");
        require(giaRaoBan[maVe] == 0, "Hay huy rao ban truoc");
        _transfer(msg.sender, nguoiNhan, maVe);
        emit DaChuyenNhuong(maVe, msg.sender, nguoiNhan);
    }

    /// Rao bán vé trên chợ. Giá phải <= 110% giá gốc.
    function raoBanVe(uint256 maVe, uint256 gia) external chiChuVe(maVe) {
        require(coTheChuyenNhuong(maVe), "Ve khong the chuyen nhuong");
        require(gia > 0, "Gia phai lon hon 0");
        require(gia <= giaBanLaiToiDa(maVe), "Gia vuot gia tran 110%");
        giaRaoBan[maVe] = gia;
        emit DaRaoBan(maVe, gia);
    }

    function huyRaoBan(uint256 maVe) external chiChuVe(maVe) {
        require(giaRaoBan[maVe] > 0, "Ve khong dang rao ban");
        delete giaRaoBan[maVe];
        emit DaHuyRaoBan(maVe);
    }

    /// Mua lại vé đang rao: gửi kèm đúng giá rao. Tiền đi thẳng tới người bán, NFT về ví người mua.
    function muaLaiVe(uint256 maVe) external payable nonReentrant {
        uint256 gia = giaRaoBan[maVe];
        address nguoiBan = _ownerOf(maVe);
        require(gia > 0, "Ve khong dang rao ban");
        require(msg.value == gia, "So tien gui khong dung gia rao");
        require(msg.sender != nguoiBan, "Khong the tu mua ve cua minh");
        require(coTheChuyenNhuong(maVe), "Ve khong the chuyen nhuong");

        delete giaRaoBan[maVe];
        _transfer(nguoiBan, msg.sender, maVe);
        _guiTien(nguoiBan, gia);
        emit DaBanLai(maVe, nguoiBan, msg.sender, gia);
    }

    /// CHẶN chuyển NFT theo cách thông thường của ERC-721 (vd chuyển thẳng trong MetaMask/OpenSea),
    /// để mọi giao dịch đều phải đi qua chuyenNhuongVe / muaLaiVe — nơi có luật khóa giờ và giá trần.
    function transferFrom(address, address, uint256) public pure override(ERC721, IERC721) {
        revert("Chi chuyen nhuong qua chuyenNhuongVe hoac muaLaiVe");
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override(ERC721, IERC721) {
        revert("Chi chuyen nhuong qua chuyenNhuongVe hoac muaLaiVe");
    }

    // ===================== DOANH THU NHÀ XE =====================

    /// Vé khách không đi (đã qua giờ chạy mà chưa soát) -> nhà xe chốt doanh thu.
    /// Vé KHÁCH KHÔNG ĐI (quá giờ chạy mà chưa soát): nhà xe chốt để nhận tiền vé. Chốt nhiều vé trong một lần.
    function chotVeKhongDi(uint256[] calldata danhSachMaVe) external onlyOwner {
        for (uint256 i = 0; i < danhSachMaVe.length; i++) {
            uint256 maVe = danhSachMaVe[i];
            require(_ownerOf(maVe) != address(0), "Ve khong ton tai");
            require(_ve[maVe].trangThai == TrangThaiVe.HieuLuc, "Ve khong con hieu luc");
            require(block.timestamp > _ve[maVe].gioKhoiHanh, "Chuyen chua chay");
            require(!daTinhDoanhThu[maVe], "Ve da duoc chot roi");
            _ghiDoanhThu(maVe, _ve[maVe].giaGoc);
            emit DaChotVeKhongDi(maVe, _ve[maVe].giaGoc);
        }
    }

    function rutDoanhThu(address payable den) external onlyOwner nonReentrant {
        uint256 soTien = doanhThuChoRut;
        require(soTien > 0, "Chua co doanh thu");
        doanhThuChoRut = 0;
        _guiTien(den, soTien);
        emit DaRutDoanhThu(den, soTien);
    }

    function datDuongDanMetadata(string calldata duongDan) external onlyOwner {
        _duongDanMetadata = duongDan;
    }

    // ===================== TRA CỨU (view: miễn phí, không tốn gas) =====================

    function layVe(uint256 maVe) external view returns (Ve memory ve, address chuSoHuu, uint256 giaDangRao) {
        return (_ve[maVe], _ownerOf(maVe), giaRaoBan[maVe]);
    }

    /// Tất cả vé đang nằm trong một ví (dùng cho trang "Vé của tôi").
    function layVeCuaChu(address chu) external view returns (uint256[] memory danhSachMa, Ve[] memory danhSachVe) {
        uint256 n = balanceOf(chu);
        danhSachMa = new uint256[](n);
        danhSachVe = new Ve[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 maVe = tokenOfOwnerByIndex(chu, i);
            danhSachMa[i] = maVe;
            danhSachVe[i] = _ve[maVe];
        }
    }

    /// Trạng thái nhiều ghế của một chuyến trong MỘT lần gọi: trả về mã vé đang giữ mỗi ghế (0 = trống).
    function layTrangThaiGhe(string calldata maChuyen, string[] calldata danhSachGhe) external view returns (uint256[] memory maVeCuaGhe) {
        maVeCuaGhe = new uint256[](danhSachGhe.length);
        for (uint256 i = 0; i < danhSachGhe.length; i++) {
            maVeCuaGhe[i] = _gheDaBan[_khoaGhe(maChuyen, danhSachGhe[i])];
        }
    }

    /// Các vé đang rao bán (dùng cho trang "Chợ vé"). Vé đã quá giờ khóa thì bỏ qua.
    function layDanhSachRaoBan() external view returns (uint256[] memory danhSachMa) {
        uint256 tong = totalSupply();
        uint256[] memory tam = new uint256[](tong);
        uint256 dem = 0;
        for (uint256 i = 0; i < tong; i++) {
            uint256 maVe = tokenByIndex(i);
            if (giaRaoBan[maVe] > 0 && coTheChuyenNhuong(maVe)) tam[dem++] = maVe;
        }
        danhSachMa = new uint256[](dem);
        for (uint256 i = 0; i < dem; i++) danhSachMa[i] = tam[i];
    }

    // ===================== HÀM NỘI BỘ =====================

    function _khoaGhe(string memory maChuyen, string memory maGhe) private pure returns (bytes32) {
        return keccak256(abi.encode(maChuyen, maGhe));
    }

    function _ghiDoanhThu(uint256 maVe, uint256 soTien) private {
        if (daTinhDoanhThu[maVe]) return;
        daTinhDoanhThu[maVe] = true;
        doanhThuChoRut += soTien;
    }

    function _guiTien(address den, uint256 soTien) private {
        if (soTien == 0) return;
        (bool thanhCong, ) = payable(den).call{value: soTien}("");
        require(thanhCong, "Chuyen tien that bai");
    }

    function _baseURI() internal view override returns (string memory) {
        return _duongDanMetadata;
    }
}
