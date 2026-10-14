// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CARToken
 * @dev ERC-20 Token đại diện cho VNĐ trong hệ thống Carbook Pay
 * Tỉ giá: 1 CAR = 1 VNĐ (quy ước)
 * Chỉ có Owner (backend) có thể mint/burn token
 */
contract CARToken is ERC20, Ownable {
    // Event khi mint token (nạp tiền)
    event TokenMinted(address indexed to, uint256 amount);
    
    // Event khi burn token (rút tiền)
    event TokenBurned(address indexed from, uint256 amount);

    constructor() ERC20("Carbook Token", "CAR") Ownable(msg.sender) {
        // Không mint token ban đầu, chỉ mint khi user nạp tiền
    }

    /**
     * @dev Mint token (chỉ Owner gọi được)
     * Gọi khi user nạp tiền VNĐ
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than 0");
        
        _mint(to, amount);
        emit TokenMinted(to, amount);
    }

    /**
     * @dev Burn token (chỉ Owner gọi được)
     * Gọi khi user rút tiền
     */
    function burn(address from, uint256 amount) public onlyOwner {
        require(from != address(0), "Cannot burn from zero address");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(from) >= amount, "Insufficient balance to burn");
        
        _burn(from, amount);
        emit TokenBurned(from, amount);
    }

    /**
     * @dev Lấy số decimal (để tính toán giá trị thực)
     */
    function decimals() public pure override returns (uint8) {
        return 0; // 1 CAR = 1 VNĐ, không cần fractional part
    }
}
