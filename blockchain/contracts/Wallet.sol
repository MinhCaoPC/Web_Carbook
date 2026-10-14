// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CARToken.sol";

/**
 * @title Wallet
 * @dev Smart contract quản lý ví của người dùng
 * Lưu số dư, trạng thái khóa, lịch sử giao dịch
 */
contract Wallet {
    CARToken public token;
    address public owner; // admin backend

    // Trạng thái ví
    enum WalletStatus { ACTIVE, LOCKED, SUSPENDED }

    struct UserWallet {
        address walletAddress;      // địa chỉ ví
        uint256 balance;            // số dư hiện tại
        uint256 lockedBalance;      // số tiền bị khóa (khi đang xử lý thanh toán)
        uint256 createdAt;          // thời điểm tạo
        WalletStatus status;        // trạng thái ví
    }

    // Mapping user → wallet info
    mapping(address => UserWallet) public wallets;
    // Mapping user → list of wallet addresses (support multiple wallets per user nếu cần)
    mapping(string => address) public userToWallet; // userId → walletAddress
    
    // Mapping for contracts/addresses that can update balance
    mapping(address => bool) public authorizedCallers;

    // Event
    event WalletCreated(address indexed walletAddress, string indexed userId);
    event BalanceUpdated(address indexed walletAddress, uint256 newBalance);
    event BalanceLocked(address indexed walletAddress, uint256 lockedAmount);
    event BalanceUnlocked(address indexed walletAddress, uint256 unlockedAmount);
    event WalletStatusChanged(address indexed walletAddress, WalletStatus status);

    constructor(address _tokenAddress) {
        token = CARToken(_tokenAddress);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier onlyOwnerOrAuthorized() {
        require(msg.sender == owner || authorizedCallers[msg.sender], "Only owner or authorized caller can call this");
        _;
    }

    function setAuthorizedCaller(address _caller, bool _status) public onlyOwner {
        authorizedCallers[_caller] = _status;
    }

    /**
     * @dev Tạo ví mới cho user
     * Gọi bởi backend khi user đăng ký
     */
    function createWallet(address _walletAddress, string memory _userId) public onlyOwner {
        require(_walletAddress != address(0), "Invalid wallet address");
        require(wallets[_walletAddress].walletAddress == address(0), "Wallet already exists");

        wallets[_walletAddress] = UserWallet({
            walletAddress: _walletAddress,
            balance: 0,
            lockedBalance: 0,
            createdAt: block.timestamp,
            status: WalletStatus.ACTIVE
        });

        userToWallet[_userId] = _walletAddress;
        emit WalletCreated(_walletAddress, _userId);
    }

    /**
     * @dev Lấy số dư hiện tại của ví
     */
    function getBalance(address _walletAddress) public view returns (uint256) {
        require(wallets[_walletAddress].walletAddress != address(0), "Wallet not found");
        return wallets[_walletAddress].balance;
    }

    /**
     * @dev Lấy số tiền bị khóa
     */
    function getLockedBalance(address _walletAddress) public view returns (uint256) {
        require(wallets[_walletAddress].walletAddress != address(0), "Wallet not found");
        return wallets[_walletAddress].lockedBalance;
    }

    /**
     * @dev Lấy số tiền khả dụng (balance - lockedBalance)
     */
    function getAvailableBalance(address _walletAddress) public view returns (uint256) {
        UserWallet storage wallet = wallets[_walletAddress];
        require(wallet.walletAddress != address(0), "Wallet not found");
        return wallet.balance - wallet.lockedBalance;
    }

    /**
     * @dev Cập nhật số dư (gọi bởi backend qua Event Listener)
     */
    function updateBalance(address _walletAddress, uint256 _newBalance) public onlyOwnerOrAuthorized {
        require(wallets[_walletAddress].walletAddress != address(0), "Wallet not found");
        wallets[_walletAddress].balance = _newBalance;
        emit BalanceUpdated(_walletAddress, _newBalance);
    }

    /**
     * @dev Khóa số tiền (lock) khi user bắt đầu thanh toán
     * Ngăn double spending
     */
    function lockBalance(address _walletAddress, uint256 _amount) public onlyOwner {
        UserWallet storage wallet = wallets[_walletAddress];
        require(wallet.walletAddress != address(0), "Wallet not found");
        require(wallet.balance - wallet.lockedBalance >= _amount, "Insufficient available balance");
        
        wallet.lockedBalance += _amount;
        emit BalanceLocked(_walletAddress, _amount);
    }

    /**
     * @dev Mở khóa số tiền
     */
    function unlockBalance(address _walletAddress, uint256 _amount) public onlyOwner {
        UserWallet storage wallet = wallets[_walletAddress];
        require(wallet.walletAddress != address(0), "Wallet not found");
        require(wallet.lockedBalance >= _amount, "Unlock amount exceeds locked balance");
        
        wallet.lockedBalance -= _amount;
        emit BalanceUnlocked(_walletAddress, _amount);
    }

    /**
     * @dev Thay đổi trạng thái ví
     */
    function setWalletStatus(address _walletAddress, WalletStatus _status) public onlyOwner {
        require(wallets[_walletAddress].walletAddress != address(0), "Wallet not found");
        wallets[_walletAddress].status = _status;
        emit WalletStatusChanged(_walletAddress, _status);
    }

    /**
     * @dev Kiểm tra ví tồn tại
     */
    function walletExists(address _walletAddress) public view returns (bool) {
        return wallets[_walletAddress].walletAddress != address(0);
    }
}
