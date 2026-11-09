// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TicketNFT
 * @dev Mỗi vé xe CARBOOK là một NFT (ERC-721), giống vé concert:
 *  - Mint khi backend (operator/relayer) xác nhận khách đã thanh toán vé bằng ví nội (Firestore).
 *  - Mỗi mã đặt vé (maDatVe) chỉ có đúng một NFT.
 *  - Chỉ chuyển nhượng QUA TicketMarket (operator): chặn bán chui ngoài sàn, ép giá trần chống phe vé.
 *  - Khoá chuyển nhượng khi vé đã dùng hoặc còn dưới `transferLockSeconds` trước giờ xe chạy.
 *  - Check-in lên xe => markUsed (vé không bán lại được nữa). Huỷ/hoàn vé => burnTicket.
 *  - ERC-2981: phần trăm bán lại (royalty) chảy về nhà xe.
 *
 * Địa chỉ chủ vé là địa chỉ "lưu ký" do backend suy ra từ tài khoản (người dùng không cần MetaMask).
 */
contract TicketNFT is ERC721, ERC2981, Ownable {
    struct Ticket {
        string maDatVe;
        string maChuyenXe;
        string ngayDi;
        string maGhe;
        uint64 departure; // giờ xe chạy (unix giây)
        uint256 facePrice; // giá gốc (VNĐ)
        bool used;
    }

    mapping(uint256 => Ticket) private _tickets;
    mapping(bytes32 => uint256) public tokenOfBooking; // keccak256(maDatVe) => tokenId
    mapping(address => bool) public operators; // relayer + TicketMarket
    uint256 public lastTokenId;
    uint256 public transferLockSeconds = 2 hours;
    string private _uriBase;

    event TicketMinted(uint256 indexed tokenId, address indexed to, string maDatVe, uint256 facePrice);
    event TicketUsed(uint256 indexed tokenId);
    event TicketBurned(uint256 indexed tokenId);
    event OperatorSet(address indexed operator, bool status);

    constructor(address royaltyReceiver, uint96 royaltyBps)
        ERC721("CARBOOK Ticket", "CBT")
        Ownable(msg.sender)
    {
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    modifier onlyOperator() {
        require(operators[msg.sender], "Only operator");
        _;
    }

    // ===== Quản trị =====

    function setOperator(address operator, bool status) external onlyOwner {
        operators[operator] = status;
        emit OperatorSet(operator, status);
    }

    function setBaseURI(string calldata newBase) external onlyOwner {
        _uriBase = newBase;
    }

    function setTransferLock(uint256 seconds_) external onlyOwner {
        transferLockSeconds = seconds_;
    }

    function setRoyalty(address receiver, uint96 bps) external onlyOwner {
        _setDefaultRoyalty(receiver, bps);
    }

    // ===== Vòng đời vé =====

    function mintTicket(
        address to,
        string calldata maDatVe,
        string calldata maChuyenXe,
        string calldata ngayDi,
        string calldata maGhe,
        uint64 departure,
        uint256 facePrice
    ) external onlyOperator returns (uint256 tokenId) {
        require(to != address(0), "Invalid owner");
        require(facePrice > 0, "Invalid price");
        require(departure > block.timestamp, "Trip already departed");
        bytes32 key = keccak256(bytes(maDatVe));
        require(tokenOfBooking[key] == 0, "Booking already minted");

        tokenId = ++lastTokenId;
        tokenOfBooking[key] = tokenId;
        _tickets[tokenId] = Ticket(maDatVe, maChuyenXe, ngayDi, maGhe, departure, facePrice, false);
        _mint(to, tokenId);
        emit TicketMinted(tokenId, to, maDatVe, facePrice);
    }

    /// Check-in lên xe: đánh dấu đã dùng, từ đó không chuyển nhượng được nữa.
    function markUsed(uint256 tokenId) external onlyOperator {
        _requireOwned(tokenId);
        require(!_tickets[tokenId].used, "Ticket already used");
        _tickets[tokenId].used = true;
        emit TicketUsed(tokenId);
    }

    /// Huỷ/hoàn vé: đốt NFT.
    function burnTicket(uint256 tokenId) external onlyOperator {
        _requireOwned(tokenId);
        require(!_tickets[tokenId].used, "Ticket already used");
        delete tokenOfBooking[keccak256(bytes(_tickets[tokenId].maDatVe))];
        delete _tickets[tokenId];
        _burn(tokenId);
        emit TicketBurned(tokenId);
    }

    // ===== Truy vấn =====

    function getTicket(uint256 tokenId) external view returns (Ticket memory) {
        _requireOwned(tokenId);
        return _tickets[tokenId];
    }

    function tradeInfo(uint256 tokenId) external view returns (uint64 departure, uint256 facePrice, bool used) {
        _requireOwned(tokenId);
        Ticket storage t = _tickets[tokenId];
        return (t.departure, t.facePrice, t.used);
    }

    /// Vé còn chuyển nhượng được: chưa dùng và còn xa giờ xe chạy hơn `transferLockSeconds`.
    function isTransferable(uint256 tokenId) public view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) return false;
        Ticket storage t = _tickets[tokenId];
        return !t.used && block.timestamp + transferLockSeconds < t.departure;
    }

    // ===== Quy tắc chuyển nhượng =====

    function _baseURI() internal view override returns (string memory) {
        return _uriBase;
    }

    // Operator (TicketMarket) được chuyển vé thay chủ lưu ký, không cần approve từng vé.
    function _isAuthorized(address owner, address spender, uint256 tokenId) internal view override returns (bool) {
        return operators[spender] || super._isAuthorized(owner, spender, tokenId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            // chuyển nhượng (không phải mint/burn)
            require(operators[_msgSender()], "Transfers only via market");
            require(isTransferable(tokenId), "Ticket not transferable");
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
