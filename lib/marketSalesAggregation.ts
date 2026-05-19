import type { MarketLinkage, MarketingPartner } from '../constants';

const toNumber = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

export interface MarketLinkageSales {
    quantityKg: number;
    pricePerKg: number;
    salesValue: number;
}

export interface MarketSalesSummary {
    linkageCount: number;
    linkedIpoCount: number;
    linkedMarketCount: number;
    totalKg: number;
    totalSales: number;
}

export interface IpoMarketSalesRow extends MarketLinkageSales {
    partner: MarketingPartner;
    link: MarketLinkage;
}

export const calculateMarketLinkageSales = (link: MarketLinkage): MarketLinkageSales => {
    const quantityKg = toNumber(link.agreedQuantityValue);
    const pricePerKg = toNumber(link.agreedPricePerKg);

    return {
        quantityKg,
        pricePerKg,
        salesValue: quantityKg * pricePerKg,
    };
};

export const summarizeMarketLinkages = (linkages: MarketLinkage[] = []): MarketSalesSummary => {
    const linkedIpos = new Set<string>();

    const totals = linkages.reduce(
        (summary, link) => {
            const sales = calculateMarketLinkageSales(link);
            if (link.ipoName) linkedIpos.add(link.ipoName);

            return {
                linkageCount: summary.linkageCount + 1,
                linkedIpoCount: summary.linkedIpoCount,
                linkedMarketCount: summary.linkedMarketCount,
                totalKg: summary.totalKg + sales.quantityKg,
                totalSales: summary.totalSales + sales.salesValue,
            };
        },
        { linkageCount: 0, linkedIpoCount: 0, linkedMarketCount: 0, totalKg: 0, totalSales: 0 }
    );

    return {
        ...totals,
        linkedIpoCount: linkedIpos.size,
        linkedMarketCount: 0,
    };
};

export const summarizeMarketPartnerSales = (partner: MarketingPartner): MarketSalesSummary => (
    summarizeMarketLinkages(partner.marketingLinkages || [])
);

export const getIpoMarketSalesRows = (partners: MarketingPartner[] = [], ipoName: string): IpoMarketSalesRow[] => {
    const rows: IpoMarketSalesRow[] = [];

    partners.forEach(partner => {
        (partner.marketingLinkages || []).forEach(link => {
            if (link.ipoName !== ipoName) return;
            rows.push({
                partner,
                link,
                ...calculateMarketLinkageSales(link),
            });
        });
    });

    return rows.sort((a, b) => new Date(b.link.agreementDate || '').getTime() - new Date(a.link.agreementDate || '').getTime());
};

export const summarizeIpoMarketSales = (rows: IpoMarketSalesRow[]): MarketSalesSummary => ({
    linkageCount: rows.length,
    linkedIpoCount: rows.length > 0 ? 1 : 0,
    linkedMarketCount: new Set(rows.map(row => row.partner.id)).size,
    totalKg: rows.reduce((sum, row) => sum + row.quantityKg, 0),
    totalSales: rows.reduce((sum, row) => sum + row.salesValue, 0),
});
