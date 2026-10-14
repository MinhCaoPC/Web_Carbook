// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CARToken.sol";
import "./Wallet.sol";
import "./TicketPayment.sol";

/**
 * @title Refund
 * @dev Smart contract xử lý hoàn tiền khi user hủy vé
 */
contract Refund {
    CARToken public token;
    Wallet public wallet;
    TicketPayment public payment;
    address public owner;
    address public relayer;

    enum RefundStatus { PENDING, SUCCESS, FAILED }

    struct RefundRequest {
        string ticketId;
        address userWallet;
        uint256 amount;
        uint256 timestamp;
        RefundStatus status;
    }

    // Mapping ticketId → Refund
    mapping(string => RefundRequest) public refunds;

    // Event
    event RefundInitiated(string indexed ticketId, address indexed userWallet, uint256 amount);
    event RefundSuccess(string indexed ticketId, address indexed userWallet, uint256 amount);
    event RefundFailed(string indexed ticketId, address indexed userWallet, string reason);

    constructor(
        address _tokenAddress,
        address _walletAddress,
        address _paymentAddress,
        address _relayerAddress
    ) {
        token = CARToken(_tokenAddress);
        wallet = Wallet(_walletAddress);
        payment = TicketPayment(_paymentAddress);
        relayer = _relayerAddress;
        owner = msg.sender;
    }

    modifier onlyOwnerOrRelayer() {
        require(msg.sender == owner || msg.sender == relayer, "Only owner or relayer can call");
        _;
    }

    /**
     * @dev Hoàn tiền cho user
     * Gọi khi user hủy vé (sau khi kiểm tra điều kiện hủy ở backend)
     */
    function refundTicket(
        string memory _ticketId,
        address _userWallet,
        uint256 _amount
    ) public onlyOwnerOrRelayer {
        require(_userWallet != address(0), "Invalid wallet address");
        require(_amount > 0, "Amount must be greater than 0");
        require(wallet.walletExists(_userWallet), "Wallet not found");
        require(refunds[_ticketId].timestamp == 0, "Refund already processed for this ticket");

        // Ghi nhận yêu cầu hoàn tiền
        refunds[_ticketId] = RefundRequest({
            ticketId: _ticketId,
            userWallet: _userWallet,
            amount: _amount,
            timestamp: block.timestamp,
            status: RefundStatus.PENDING
        });

        emit RefundInitiated(_ticketId, _userWallet, _amount);

        // Thực hiện hoàn tiền
        _processRefund(_ticketId, _userWallet, _amount);
    }

    /**
     * @dev Thực hiện hoàn tiền (internal)
     */
    function _processRefund(
        string memory _ticketId,
        address _userWallet,
        uint256 _amount
    ) internal {
        // Cộng tiền vào số dư
        uint256 currentBalance = wallet.getBalance(_userWallet);
        uint256 newBalance = currentBalance + _amount;
        wallet.updateBalance(_userWallet, newBalance);

        // Cập nhật trạng thái
        refunds[_ticketId].status = RefundStatus.SUCCESS;

        emit RefundSuccess(_ticketId, _userWallet, _amount);
    }

    /**
     * @dev Lấy thông tin hoàn tiền
     */
    function getRefund(string memory _ticketId) public view returns (RefundRequest memory) {
        require(refunds[_ticketId].timestamp != 0, "Refund not found");
        return refunds[_ticketId];
    }

    /**
     * @dev Kiểm tra trạng thái hoàn tiền
     */
    function getRefundStatus(string memory _ticketId) public view returns (RefundStatus) {
        require(refunds[_ticketId].timestamp != 0, "Refund not found");
        return refunds[_ticketId].status;
    }

    /**
     * @dev Cập nhật Relayer address
     */
    function setRelayer(address _newRelayer) public {
        require(msg.sender == owner, "Only owner can set relayer");
        relayer = _newRelayer;
    }
}
