'use client';

import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { ChartConfig } from '@/components/ui/chart';
import type { CreditSaleWithPayments } from '@/lib/data';
import { subMonths, format, getYear, getMonth } from 'date-fns';

const chartConfig = {
  purchases: {
    label: 'Compras',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export function CustomerPurchasesChart({ salesData }: { salesData: CreditSaleWithPayments[] }) {

  const monthlyPurchasesData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return {
            month: format(d, 'MMM'),
            year: getYear(d),
            monthIndex: getMonth(d),
            purchases: 0
        };
    });

    salesData.forEach(sale => {
        if (!sale.saleDate) return;
        
        const saleDate = new Date(sale.saleDate);
        
        const correctedSaleDate = new Date(saleDate.getUTCFullYear(), saleDate.getUTCMonth(), saleDate.getUTCDate());

        const saleMonthIndex = getMonth(correctedSaleDate);
        const saleYear = getYear(correctedSaleDate);

        const monthData = months.find(m => m.monthIndex === saleMonthIndex && m.year === saleYear);
        if (monthData) {
            monthData.purchases += sale.amount;
        }
    });

    return months.map(({month, purchases}) => ({month, purchases}));
  }, [salesData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de Compras</CardTitle>
        <CardDescription>
          Un resumen de tus compras de los últimos 6 meses.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-2">
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={monthlyPurchasesData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar dataKey="purchases" fill="var(--color-purchases)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
