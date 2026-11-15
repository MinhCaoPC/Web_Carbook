// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title QuanLyChuyenXe
 * @notice Lớp CHA (abstract) lo phần quản trị của nhà xe:
 *   1. ĐĂNG KÝ SƠ ĐỒ GHẾ: mỗi loại xe một lần, vd "LIMOUSINE_34" gồm các ghế A01..A17, B01..B17.
 *   2. MỞ BÁN CHUYẾN: giá vé, giờ khởi hành, xe chạy chuyến đó dùng sơ đồ ghế nào.
 *   3. Cấp/thu quyền cho NHÂN VIÊN SOÁT VÉ.
 *
 * Nhờ có sơ đồ ghế trên blockchain, hợp đồng chỉ bán những ghế CÓ THẬT trên xe
 * (gọi thẳng hợp đồng để mua ghế "Z99" sẽ bị từ chối).
 *
 * Thông tin hiển thị (tuyến đường, biển số, vị trí ghế trên sơ đồ...) vẫn nằm ở Firebase (off-chain).
 * Mã chuyến có dạng "<mã chuyến xe>_<ngày đi>", ví dụ "CX001_2026-11-12".
 */
abstract contract QuanLyChuyenXe is Ownable {
    struct ChuyenXe {
        uint256 giaVe;        // giá 1 vé, đơn vị wei (1 ETH = 10^18 wei)
        uint64 gioKhoiHanh;   // giờ xe chạy, dạng unix (số giây tính từ 1/1/1970)
        uint16 soGhe;         // tổng số ghế của xe (= số ghế trong sơ đồ)
        bool dangMoBan;       // true = khách đang mua được
        bytes32 idSoDo;       // sơ đồ ghế của xe chạy chuyến này
    }

    // Khóa = keccak256(mã chuyến). Dùng bytes32 thay vì string để tiết kiệm gas.
    mapping(bytes32 => ChuyenXe) private _chuyenXe;

    // SƠ ĐỒ GHẾ: id sơ đồ -> số ghế (0 = chưa đăng ký)
    mapping(bytes32 => uint16) public soGheCuaSoDo;
    // id sơ đồ -> (id ghế -> true nếu ghế này có trên xe)
    mapping(bytes32 => mapping(bytes32 => bool)) private _gheCoTrenXe;

    // Ví nào là nhân viên soát vé
    mapping(address => bool) public laNhanVienSoatVe;

    event DaDangKySoDoGhe(string maSoDo, uint16 soGhe);
    event DaMoBanChuyen(string maChuyen, uint256 giaVe, uint64 gioKhoiHanh, string maSoDo);
    event DaDongBanChuyen(string maChuyen);
    event DaCapQuyenSoatVe(address indexed nhanVien, bool coQuyen);

    constructor() Ownable(msg.sender) {}

    /// Chỉ chủ hợp đồng hoặc nhân viên được cấp quyền mới soát vé được.
    modifier chiNhanVienSoatVe() {
        require(laNhanVienSoatVe[msg.sender] || msg.sender == owner(), "Khong co quyen soat ve");
        _;
    }

    // ===================== CHỨC NĂNG CỦA NHÀ XE =====================

    /// Đăng ký một sơ đồ ghế (làm MỘT lần cho mỗi loại xe). Muốn đổi sơ đồ thì đăng ký mã mới.
    function dangKySoDoGhe(string calldata maSoDo, string[] calldata danhSachGhe) external onlyOwner {
        bytes32 idSoDo = layIdChuoi(maSoDo);
        require(soGheCuaSoDo[idSoDo] == 0, "So do ghe da dang ky");
        require(danhSachGhe.length > 0 && danhSachGhe.length <= 100, "So do phai co tu 1 den 100 ghe");

        for (uint256 i = 0; i < danhSachGhe.length; i++) {
            bytes32 idGhe = layIdChuoi(danhSachGhe[i]);
            require(!_gheCoTrenXe[idSoDo][idGhe], "Trung ma ghe trong so do");
            _gheCoTrenXe[idSoDo][idGhe] = true;
        }
        soGheCuaSoDo[idSoDo] = uint16(danhSachGhe.length);
        emit DaDangKySoDoGhe(maSoDo, uint16(danhSachGhe.length));
    }

    /// Mở bán (hoặc cập nhật) một chuyến. Vé đã bán trước đó giữ nguyên giá và giờ chạy đã ghi trên vé.
    function moBanChuyen(string calldata maChuyen, uint256 giaVe, uint64 gioKhoiHanh, string calldata maSoDo) public onlyOwner {
        bytes32 idSoDo = layIdChuoi(maSoDo);
        uint16 soGhe = soGheCuaSoDo[idSoDo];
        require(giaVe > 0, "Gia ve phai lon hon 0");
        require(soGhe > 0, "So do ghe chua dang ky");
        require(gioKhoiHanh > block.timestamp, "Chuyen da khoi hanh");
        _chuyenXe[layIdChuoi(maChuyen)] = ChuyenXe(giaVe, gioKhoiHanh, soGhe, true, idSoDo);
        emit DaMoBanChuyen(maChuyen, giaVe, gioKhoiHanh, maSoDo);
    }

    /// Mở bán nhiều chuyến trong MỘT giao dịch (chỉ phải xác nhận MetaMask một lần).
    function moBanNhieuChuyen(
        string[] calldata maChuyen,
        uint256[] calldata giaVe,
        uint64[] calldata gioKhoiHanh,
        string[] calldata maSoDo
    ) external onlyOwner {
        require(
            maChuyen.length == giaVe.length && giaVe.length == gioKhoiHanh.length && gioKhoiHanh.length == maSoDo.length,
            "Do dai danh sach khong khop"
        );
        for (uint256 i = 0; i < maChuyen.length; i++) {
            moBanChuyen(maChuyen[i], giaVe[i], gioKhoiHanh[i], maSoDo[i]);
        }
    }

    /// Ngừng bán vé mới cho một chuyến (vé đã bán vẫn còn hiệu lực).
    function dongBanChuyen(string calldata maChuyen) external onlyOwner {
        _chuyenXe[layIdChuoi(maChuyen)].dangMoBan = false;
        emit DaDongBanChuyen(maChuyen);
    }

    function datNhanVienSoatVe(address nhanVien, bool coQuyen) external onlyOwner {
        laNhanVienSoatVe[nhanVien] = coQuyen;
        emit DaCapQuyenSoatVe(nhanVien, coQuyen);
    }

    // ===================== TRA CỨU =====================

    /// Đổi chuỗi (mã chuyến, mã sơ đồ, mã ghế) thành bytes32 để làm khóa tra cứu.
    function layIdChuoi(string memory chuoi) public pure returns (bytes32) {
        return keccak256(bytes(chuoi));
    }

    /// Giữ tên cũ cho dễ đọc: id của một chuyến.
    function layIdChuyen(string memory maChuyen) public pure returns (bytes32) {
        return layIdChuoi(maChuyen);
    }

    function layChuyen(string memory maChuyen) public view returns (ChuyenXe memory) {
        return _chuyenXe[layIdChuyen(maChuyen)];
    }

    /// Ghế `maGhe` có trên xe chạy chuyến `maChuyen` không.
    function gheCoTrenXe(string memory maChuyen, string memory maGhe) public view returns (bool) {
        return _gheCoTrenXe[layChuyen(maChuyen).idSoDo][layIdChuoi(maGhe)];
    }
}
