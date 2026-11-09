/**
 * @file ITicketNftRepository.ts
 * @description Truy cập hợp đồng vé NFT (TicketNFT) và chợ bán lại (TicketMarket).
 * Service chỉ phụ thuộc interface này nên test được bằng bản giả, không cần blockchain thật.
 */
export interface MintTicketInput {
    ownerAddress: string;
    maDatVe: string;
    maChuyenXe: string;
    ngayDi: string;
    maGhe: string;
    departureUnix: number;
    facePrice: number;
}

export interface TicketOnChain {
    tokenId: number;
    owner: string;
    used: boolean;
    facePrice: number;
    departure: number;
}

export interface ITicketNftRepository {
    mintTicket(input: MintTicketInput): Promise<{ tokenId: number; txHash: string }>;
    burnTicket(tokenId: number): Promise<{ txHash: string }>;
    markUsed(tokenId: number): Promise<{ txHash: string }>;
    getTicket(tokenId: number): Promise<TicketOnChain>;
    list(tokenId: number, sellerAddress: string, price: number): Promise<{ txHash: string }>;
    cancelListing(tokenId: number, sellerAddress: string): Promise<{ txHash: string }>;
    buy(tokenId: number, buyerAddress: string): Promise<{ txHash: string }>;
}
