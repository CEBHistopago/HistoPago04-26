'use client';

import { useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { ChartConfig } from '@/components/ui/chart';
import type { CreditSale } from '@/lib/data';
import { format, getYear, getMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const chartConfig = {
  sales: {
    label: 'Ventas',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export function SalesChart({ salesData }: { salesData: CreditSale[] }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  // Generar lista de años para el selector (año actual + 4 anteriores)
  const years = useMemo(() => {
    const yearsList = [];
    for (let i = 0; i < 5; i++) {
      yearsList.push((currentYear - i).toString());
    }
    return yearsList;
  }, [currentYear]);

  const monthlySalesChartData = useMemo(() => {
    const targetYear = parseInt(selectedYear);
    
    // Crear base para los 12 meses del año seleccionado
    const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(targetYear, i, 1);
        return {
            month: format(d, 'MMM', { locale: es }).toUpperCase().replace('.', ''),
            monthIndex: i,
            sales: 0
        };
    });

    salesData.forEach(sale => {
        if (!sale.saleDate) return;
        
        // Manejar correctamente Firestore Timestamp o string date
        const saleDate = sale.saleDate.toDate ? sale.saleDate.toDate() : new Date(sale.saleDate);
        
        // Usar valores locales para comparar con el año seleccionado
        const sYear = getYear(saleDate);
        const sMonthIndex = getMonth(saleDate);

        if (sYear === targetYear) {
            if (months[sMonthIndex]) {
                months[sMonthIndex].sales += sale.amount;
            }
        }
    });

    return months.map(({ month, sales }) => ({ month, sales }));
  }, [salesData, selectedYear]);

  return (
    <Card className="lg:col-span-7">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-7">
        <div className="space-y-1">
          <CardTitle>Resumen de Ventas Anual</CardTitle>
          <CardDescription>
            Ingresos mensuales registrados durante el año {selectedYear}.
          </CardDescription>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pl-2">
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <BarChart data={monthlySalesChartData} accessibilityLayer margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              fontSize={12}
            />
            <YAxis 
                tickLine={false}
                axisLine={false}
                fontSize={12}
                tickFormatter={(value) => `$${Number(value) >= 1000 ? (Number(value) / 1000).toFixed(1) + 'k' : value}`} 
            />
            <ChartTooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
