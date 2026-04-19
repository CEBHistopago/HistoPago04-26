import * as React from 'react';
import {cn} from '@/lib/utils';
import {
  CardDescription as CardPrimitiveDescription,
  Card as CardPrimitive,
  CardContent as CardPrimitiveContent,
  CardFooter as CardPrimitiveFooter,
  CardHeader as CardPrimitiveHeader,
  CardTitle as CardPrimitiveTitle,
} from '@/components/ui/card-primitive';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

const Card = CardPrimitive;
const CardHeader = CardPrimitiveHeader;
const CardTitle = CardPrimitiveTitle;
const CardDescription = CardPrimitiveDescription;
const CardContent = CardPrimitiveContent;
const CardFooter = CardPrimitiveFooter;

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
