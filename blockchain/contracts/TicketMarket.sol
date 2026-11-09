// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./TicketNFT.sol";

/**
 * @title TicketMarket
 * @dev Chợ bán lại vé NFT có luật chống phe vé:
 *  - Giá rao bán tối đa `maxMarkupBps` (mặc định 110%) so với giá gốc của vé.
 *  - Vé đã dùng / sát giờ xe chạy (TicketNFT.isTransferable == false) không rao bán được.
 *  - Mỗi vé chỉ có một tin rao; người bán phải đang là chủ vé.
 *
 * Tiền của giao dịch chạy trên ví nội (Firestore); contract này chỉ chốt QUYỀN SỞ HỮU và giá,
 * được gọi bởi backend (operator) sau khi backend đã chuyển tiền giữa hai ví nội.
 */
contract TicketMarket is Ownable {
    TicketNFT public immutable nft;
    uint256 public maxMarkupBps = 11000; // 110%
    mapping(address => bool) public operators;

    struct Listing {
        address seller;
        uint256 price;
    }
    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 royalty);
    event OperatorSet(address indexed operator, bool status);
    event MaxMarkupSet(uint256 bps);

    constructor(address nftAddress) Ownable(msg.sender) {
        nft = TicketNFT(nftAddress);
    }

    modifier onlyOperator() {
        require(operators[msg.sender], "Only operator");
        _;
    }

    function setOperator(address operator, bool status) external onlyOwner {
        operators[operator] = status;
        emit OperatorSet(operator, status);
    }

    function setMaxMarkup(uint256 bps) external onlyOwner {
        require(bps >= 10000 && bps <= 20000, "Markup 100%-200%");
        maxMarkupBps = bps;
        emit MaxMarkupSet(bps);
    }

    function maxPrice(uint256 tokenId) public view returns (uint256) {
        (, uint256 face, ) = nft.tradeInfo(tokenId);
        return (face * maxMarkupBps) / 10000;
    }

    function list(uint256 tokenId, address seller, uint256 price) external onlyOperator {
        require(nft.ownerOf(tokenId) == seller, "Not ticket owner");
        require(listings[tokenId].seller == address(0), "Already listed");
        require(nft.isTransferable(tokenId), "Ticket not transferable");
        require(price > 0, "Invalid price");
        require(price <= maxPrice(tokenId), "Price above cap");
        listings[tokenId] = Listing(seller, price);
        emit Listed(tokenId, seller, price);
    }

    function cancel(uint256 tokenId, address seller) external onlyOperator {
        require(listings[tokenId].seller == seller && seller != address(0), "Not your listing");
        delete listings[tokenId];
        emit ListingCancelled(tokenId, seller);
    }

    function buy(uint256 tokenId, address buyer) external onlyOperator {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "Not listed");
        require(buyer != address(0) && buyer != l.seller, "Invalid buyer");
        require(nft.ownerOf(tokenId) == l.seller, "Seller no longer owner");
        delete listings[tokenId];
        nft.transferFrom(l.seller, buyer, tokenId); // revert nếu vé hết quyền chuyển nhượng
        (, uint256 royalty) = nft.royaltyInfo(tokenId, l.price);
        emit Sold(tokenId, l.seller, buyer, l.price, royalty);
    }
}
