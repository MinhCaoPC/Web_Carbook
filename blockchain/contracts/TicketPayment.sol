// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CARToken.sol";
import "./Wallet.sol";

/**
 * @title TicketPayment
 * @dev Smart contract xử lý thanh toán vé xe
 * Ghi nhận giao dịch, trả gas hộ user qua Relayer
 */
contract TicketPayment {
    CARToken public token;
    Wallet public wallet;
    address public owner;
    address public relayer; // Relayer wallet (trả gas hộ)

    enum PaymentStatus { PENDING, SUCCESS, FAILED, REFUNDED }

    struct Payment {
        string ticketId;
        address userWallet;
        uint256 amount;
        uint256 timestamp;
        PaymentStatus status;
        string txHash; // hash của payment
    }

    // Mapping ticketId → Payment
    mapping(string => Payment) public payments;

    // Event
    event PaymentInitiated(string indexed ticketId, address indexed userWallet, uint256 amount);
    event PaymentSuccess(string indexed ticketId, address indexed userWallet, uint256 amount);
    event PaymentFailed(string indexed ticketId, address indexed userWallet, string reason);

    constructor(address _tokenAddress, address _walletAddress, address _relayerAddress) {
        token = CARToken(_tokenAddress);
        wallet = Wallet(_walletAddress);
        relayer = _relayerAddress;
        owner = msg.sender;
    }

    modifier onlyOwnerOrRelayer() {
        require(msg.sender == owner || msg.sender == relayer, "Only owner or relayer can call");
        _;
    }

    /**
     * @dev Thanh toán vé
     * User gửi thanh toán, Relayer ký transaction & trả gas
     */
    function payForTicket(
        string memory _ticketId,
        address _userWallet,
        uint256 _amount
    ) public onlyOwnerOrRelayer {
        require(_userWallet != address(0), "Invalid wallet address");
        require(_amount > 0, "Amount must be greater than 0");
        require(wallet.walletExists(_userWallet), "Wallet not found");
        require(payments[_ticketId].timestamp == 0, "Payment already exists");

        // Kiểm tra số dư khả dụng
        uint256 availableBalance = wallet.getAvailableBalance(_userWallet);
        require(availableBalance >= _amount, "Insufficient balance");

        // Ghi nhận giao dịch với trạng thái PENDING
        payments[_ticketId] = Payment({
            ticketId: _ticketId,
            userWallet: _userWallet,
            amount: _amount,
            timestamp: block.timestamp,
            status: PaymentStatus.PENDING,
            txHash: ""
        });

        emit PaymentInitiated(_ticketId, _userWallet, _amount);

        // Thực hiện chuyển token từ user sang Backend wallet (ví hệ thống)
        // Trong thực tế, token đã lưu ở ví user, backend chỉ cần lock balance
        // và ghi lại transaction
        
        _executePayment(_ticketId, _userWallet, _amount);
    }

    /**
     * @dev Thực hiện chuyển token (internal)
     */
    function _executePayment(
        string memory _ticketId,
        address _userWallet,
        uint256 _amount
    ) internal {
        // Cập nhật số dư ở Wallet contract
        uint256 currentBalance = wallet.getBalance(_userWallet);
        uint256 newBalance = currentBalance - _amount;
        wallet.updateBalance(_userWallet, newBalance);

        // Cập nhật trạng thái thành SUCCESS
        payments[_ticketId].status = PaymentStatus.SUCCESS;
        payments[_ticketId].txHash = _toHex(block.number);

        emit PaymentSuccess(_ticketId, _userWallet, _amount);
    }

    /**
     * @dev Lấy thông tin thanh toán
     */
    function getPayment(string memory _ticketId) public view returns (Payment memory) {
        require(payments[_ticketId].timestamp != 0, "Payment not found");
        return payments[_ticketId];
    }

    /**
     * @dev Kiểm tra trạng thái thanh toán
     */
    function getPaymentStatus(string memory _ticketId) public view returns (PaymentStatus) {
        require(payments[_ticketId].timestamp != 0, "Payment not found");
        return payments[_ticketId].status;
    }

    /**
     * @dev Hủy thanh toán (nếu xảy ra lỗi, cần rollback)
     */
    function cancelPayment(string memory _ticketId) public onlyOwnerOrRelayer {
        require(payments[_ticketId].timestamp != 0, "Payment not found");
        require(payments[_ticketId].status == PaymentStatus.PENDING, "Can only cancel PENDING payment");

        Payment storage payment = payments[_ticketId];
        
        // Hoàn lại số tiền
        uint256 currentBalance = wallet.getBalance(payment.userWallet);
        uint256 newBalance = currentBalance + payment.amount;
        wallet.updateBalance(payment.userWallet, newBalance);

        payment.status = PaymentStatus.FAILED;
        emit PaymentFailed(_ticketId, payment.userWallet, "Payment cancelled");
    }

    /**
     * @dev Helper: chuyển bytes sang hex string
     */
    function _toHex(uint256 _value) internal pure returns (string memory) {
        bytes32 value = bytes32(_value);
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            uint8 _uint = uint8(value[i]);
            str[i * 2] = alphabet[_uint / 16];
            str[1 + i * 2] = alphabet[_uint % 16];
        }
        return string(str);
    }

    /**
     * @dev Cập nhật Relayer address (chỉ Owner)
     */
    function setRelayer(address _newRelayer) public {
        require(msg.sender == owner, "Only owner can set relayer");
        relayer = _newRelayer;
    }
}
