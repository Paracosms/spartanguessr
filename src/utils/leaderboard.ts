export const RANK_COLORS: Record<number, string> = {
    1: "#FFC108",
    2: "#C0C0C0",
    3: "#CD7F32",
};

export function getRankLabel(rank: number) {
    const mod100 = rank % 100;
    const mod10 = rank % 10;
    if (mod100 >= 11 && mod100 <= 13) return `${rank}TH`;
    if (mod10 === 1) return `${rank}ST`;
    if (mod10 === 2) return `${rank}ND`;
    if (mod10 === 3) return `${rank}RD`;
    return `${rank}TH`;
}
