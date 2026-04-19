'use client';

import { PlusCircle, Loader2, FileWarning, Coins, FilePenLine, MoreVertical, Search, Check, AlertTriangle, PauseCircle, Trash2, Ban, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { 
    CreateSaleSchema, type CreateSaleValues, type CreditSale,
    type Payment,
    Vendor,
} from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import React, { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { format, addWeeks, addMonths, addQuarters, isValid, parseISO, differenceInDays, addDays, startOfDay } from 'date-fns';
import { createSale, updateSale, rejectPaymentByVendor, verifyPaymentByVendor, requestSaleSuspension, requestSaleDeletion, voidPaymentByVendor } from '@/ai/flows/vendor-sales-flow';
import { findCustomerGlobally } from '@/ai/flows/find-customer-globally-flow';
import { PaymentDialog } from '@/components/payment-dialog';
import { cn, formatCurrency } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';


const phonePrefixes = ["412", "414", "416", "424", "426", "422"];
const idPrefixes = ["V", "E", "J", "G"];


function CreateSaleDialog({ onSaleCreated, isRentalPlan }: { onSaleCreated: () => void, isRentalPlan: boolean }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const { user } = useUser();

  const form = useForm<CreateSaleValues>({
    resolver: zodResolver(CreateSaleSchema),
    defaultValues: {
      customerName: '',
      idPrefix: '',
      idNumber: '',
      customerEmail: '',
      phonePrefix: '',
      phoneNumber: '',
      customerType: 'Persona Natural',
      creditType: isRentalPlan ? 'Alquiler Residencial' : 'Compra al Credito',
      invoiceNumber: '',
      amount: 0,
      downPaymentType: 'Monto Fijo',
      downPaymentValue: 0,
      remainingBalance: 0,
      items: '',
      dueDate: '',
      saleDate: new Date().toISOString().split('T')[0],
      numberOfInstallments: isRentalPlan ? 12 : 1,
      installmentAmount: 0,
      paymentFrequency: 'Mensual',
      firstPaymentDate: '',
      salesPerson: '',
    },
  });

  const { watch, setValue, reset } = form;
  const amount = watch('amount');
  const downPaymentType = watch('downPaymentType');
  const downPaymentValue = watch('downPaymentValue');
  const numberOfInstallments = watch('numberOfInstallments');
  const firstPaymentDate = watch('firstPaymentDate');
  const paymentFrequency = watch('paymentFrequency');
  const idPrefix = watch('idPrefix');
  const idNumber = watch('idNumber');
  const saleDate = watch('saleDate');
  
  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);


  useEffect(() => {
    const totalAmount = Number(amount) || 0;
    const dpValue = Number(downPaymentValue) || 0;
    const installments = Number(numberOfInstallments) || 1;

    let balance = totalAmount;
    if (!isRentalPlan) {
        let downPayment = 0;
        if (downPaymentType === 'Porcentaje') {
            downPayment = totalAmount * (dpValue / 100);
        } else {
            downPayment = dpValue;
        }
        balance = totalAmount - downPayment;
    }
    
    const installment = installments > 0 ? balance / installments : 0;
    const roundedInstallment = Math.round(installment * 100) / 100;
    const roundedBalance = Math.round(balance * 100) / 100;

    setValue('remainingBalance', roundedBalance < 0 ? 0 : roundedBalance);
    setValue('installmentAmount', roundedInstallment < 0 ? 0 : roundedInstallment);

  }, [amount, downPaymentType, downPaymentValue, numberOfInstallments, setValue, isRentalPlan]);
  
  useEffect(() => {
    if (firstPaymentDate && numberOfInstallments > 0 && paymentFrequency) {
        const startDate = parseISO(firstPaymentDate);
        if (isValid(startDate)) {
            let finalDueDate;
            const installments = numberOfInstallments -1;

            switch (paymentFrequency) {
                case 'Semanal':
                    finalDueDate = addWeeks(startDate, installments);
                    break;
                case 'Quincenal':
                    finalDueDate = addWeeks(startDate, installments * 2);
                    break;
                case 'Mensual':
                    finalDueDate = addMonths(startDate, installments);
                    break;
                case 'Trimestral':
                    finalDueDate = addQuarters(startDate, installments);
                    break;
                default:
                    return;
            }
            setValue('dueDate', format(finalDueDate, 'yyyy-MM-dd'));
        }
    }
  }, [firstPaymentDate, numberOfInstallments, paymentFrequency, setValue]);

  useEffect(() => {
    if (idPrefix === 'V' || idPrefix === 'E') {
        setValue('customerType', 'Persona Natural');
    } else if (idPrefix === 'J') {
        setValue('customerType', 'Persona Juridica');
    } else if (idPrefix === 'G') {
        setValue('customerType', 'Ente Gubernamental');
    }
}, [idPrefix, setValue]);

  useEffect(() => {
    if (!idPrefix || !idNumber || idNumber.length < 7) return;

    const fullId = `${idPrefix}-${idNumber}`;

    const handler = setTimeout(async () => {
        try {
            const result = await findCustomerGlobally({ customerIdentification: fullId });
            if (result) {
                setValue('customerName', result.customerName, { shouldValidate: true });
                if (result.customerEmail) setValue('customerEmail', result.customerEmail, { shouldValidate: true });
                if (result.customerType) setValue('customerType' as any, result.customerType, { shouldValidate: true });
                if (result.customerPhone) {
                    const phone = result.customerPhone.replace('+58', '');
                    const prefix = phone.substring(0,3);
                    const number = phone.substring(3);
                    if (phonePrefixes.includes(prefix)) {
                        setValue('phonePrefix', prefix, { shouldValidate: true });
                        setValue('phoneNumber', number, { shouldValidate: true });
                    }
                }
            }
        } catch (error) {
            console.error("Error during customer autocomplete search:", error);
        }
    }, 500);

    return () => {
        clearTimeout(handler);
    };
  }, [idPrefix, idNumber, setValue]);
  
  useEffect(() => {
    if (saleDate && paymentFrequency) {
        const startDate = new Date(`${saleDate}T00:00:00`);
        if (isValid(startDate)) {
            let firstPayment: Date;
            switch(paymentFrequency) {
                case 'Semanal':
                    firstPayment = addDays(startDate, 7);
                    break;
                case 'Quincenal':
                    firstPayment = addDays(startDate, 15);
                    break;
                case 'Mensual':
                    firstPayment = addMonths(startDate, 1);
                    break;
                case 'Trimestral':
                    firstPayment = addMonths(startDate, 3);
                    break;
                default:
                    return;
            }
            setValue('firstPaymentDate', format(firstPayment, 'yyyy-MM-dd'));
        }
    }
  }, [saleDate, paymentFrequency, setValue]);


  const onSubmit = async (data: CreateSaleValues) => {
    if (!user) {
        toast({
            variant: 'destructive',
            title: 'Error de autenticación',
            description: 'No se pudo verificar el usuario.',
        });
        return;
    }
    
    setIsPending(true);
    
    try {
        const result = await createSale({
            vendorId: user.uid,
            saleData: data,
        });

        if (result.success) {
             toast({
                title: isRentalPlan ? 'Contrato Registrado' : 'Venta Registrada',
                description: isRentalPlan ? 'El contrato ha sido creado y ahora está activo.' : 'La venta ha sido creada y ahora está activa.',
            });
            onSaleCreated();
            setOpen(false);
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        console.error("Error creating sale:", error);
        toast({
            variant: 'destructive',
            title: isRentalPlan ? 'Error al crear el contrato' : 'Error al crear la venta',
            description: error.message || 'Ocurrió un error inesperado al guardar en la base de datos.',
        });
    } finally {
        setIsPending(false);
    }
  };

  const creditTypes = isRentalPlan ? [
    { value: "Alquiler Residencial", label: "Alquiler Residencial" },
    { value: "Alquiler Comercial", label: "Alquiler Comercial" },
    { value: "Arrendamiento", label: "Arrendamiento (General)" },
  ] : [
    { value: "Compra al Credito", label: "Compra al Crédito" },
    { value: "Financiamiento de Vehiculo", label: "Financiamiento de Vehículo" },
    { value: "Financiamiento de Moto", label: "Financiamiento de Moto" },
    { value: "Honorarios Profesionales", label: "Honorarios Profesionales" },
    { value: "Servicios", label: "Servicios" },
    { value: "Servicios Publicos", label: "Servicios Públicos" },
    { value: "Recibo Condominio", label: "Recibo Condominio" },
    { value: "Matricula", label: "Matrícula" },
    { value: "Matricula Educativa", label: "Matrícula Educativa" },
    { value: "Servicios de Salud", label: "Servicios de Salud" },
    { value: "Afiliacion", label: "Afiliación" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <PlusCircle className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{isRentalPlan ? 'Nuevo Contrato' : 'Nueva Venta'}</span>
        </Button>
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] p-0 max-h-[90vh]"
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
         <DialogHeader className="p-6 pb-0">
          <DialogTitle>{isRentalPlan ? 'Registrar Nuevo Contrato de Alquiler' : 'Registrar Nueva Venta a Crédito'}</DialogTitle>
          <DialogDescription>
            {isRentalPlan ? 'Complete los detalles del contrato y del inquilino.' : 'Complete los detalles de la venta y del cliente. Todos los campos marcados con * son obligatorios.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} id="sale-form" className="overflow-y-auto px-6 space-y-4">
              
              <div>
                  <FormLabel>Identificación del {isRentalPlan ? 'Inquilino' : 'Cliente'} *</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <FormField
                      control={form.control}
                      name="idPrefix"
                      render={({ field }) => (
                        <FormItem className="w-1/3">
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Prefijo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {idPrefixes.map(prefix => (
                                <SelectItem key={prefix} value={prefix}>{prefix}-</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="idNumber"
                      render={({ field }) => (
                        <FormItem className="w-2/3">
                          <FormControl>
                            <Input placeholder="12345678" {...field} disabled={isPending}/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
              </div>

              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del {isRentalPlan ? 'Inquilino' : 'Cliente'} *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo Electrónico</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="cliente@ejemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
               <div>
                  <FormLabel>Teléfono del {isRentalPlan ? 'Inquilino' : 'Cliente'} *</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <FormField
                      control={form.control}
                      name="phonePrefix"
                      render={({ field }) => (
                        <FormItem className="w-1/3">
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Prefijo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {phonePrefixes.map(prefix => (
                                <SelectItem key={prefix} value={prefix}>{prefix}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem className="w-2/3">
                          <FormControl>
                            <Input type="tel" placeholder="1234567" maxLength={7} {...field} disabled={isPending} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>


               <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                 <FormField
                  control={form.control}
                  name="customerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de {isRentalPlan ? 'Inquilino' : 'Cliente'} *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Persona Natural">Persona Natural</SelectItem>
                          <SelectItem value="Persona Juridica">Persona Jurídica</SelectItem>
                          <SelectItem value="Ente Gubernamental">Ente Gubernamental</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="creditType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Compromiso *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {creditTypes.map(type => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                    control={form.control}
                    name="salesPerson"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Vendedor / Asesor</FormLabel>
                        <FormControl>
                        <Input placeholder="Nombre del asesor" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRentalPlan ? 'Número de Contrato' : 'Número de Documento'} *</FormLabel>
                      <FormControl>
                        <Input placeholder={isRentalPlan ? "CON-001" : "DOC-001"} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="items"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isRentalPlan ? 'Descripción (Inmueble/Unidad)' : 'Items Vendidos'}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={isRentalPlan ? "Ej: Apto 3, Res. Sol" : "Descripción de los productos o servicios"} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRentalPlan ? 'Monto Total del Contrato' : 'Monto Total (Documento)'} *</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="downPaymentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de {isRentalPlan ? 'Depósito' : 'Inicial'} *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Monto Fijo">Monto Fijo</SelectItem>
                          <SelectItem value="Porcentaje">Porcentaje</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

               <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="downPaymentValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {watch('downPaymentType') === 'Monto Fijo' ? `Monto del ${isRentalPlan ? 'Depósito' : 'Inicial'} ($) *` : `Porcentaje del ${isRentalPlan ? 'Depósito' : 'Inicial'} (%) *`}
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="any" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="remainingBalance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRentalPlan ? 'Saldo a Financiar (si aplica)' : 'Saldo a Financiar'} *</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" {...field} readOnly className="bg-muted" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="numberOfInstallments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRentalPlan ? 'Duración del Contrato (Meses)' : 'Número de Cuotas'} *</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="installmentAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRentalPlan ? 'Canon de Arrendamiento (Calculado)' : 'Monto de Cuota (Calculado)'} *</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" {...field} readOnly className="bg-muted" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="saleDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRentalPlan ? 'Fecha del Contrato' : 'Fecha de Venta'} *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="paymentFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frecuencia de Pago *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione frecuencia" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Semanal">Semanal</SelectItem>
                          <SelectItem value="Quincenal">Quincenal</SelectItem>
                          <SelectItem value="Mensual">Mensual</SelectItem>
                          <SelectItem value="Trimestral">Trimestral</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
               <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstPaymentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Primer Pago *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Vencimiento Final *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} readOnly className="bg-muted"/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
        </Form>
        <DialogFooter className="p-6 pt-4 border-t mt-4">
              <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={isPending}>
                      Cancelar
                  </Button>
              </DialogClose>
              <Button type="submit" form="sale-form" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isRentalPlan ? 'Guardar Contrato' : 'Guardar Venta'}
              </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSaleDialog({ sale, children, onSaleUpdated, isRentalPlan }: { sale: CreditSale, children: React.ReactNode, onSaleUpdated: () => void, isRentalPlan: boolean }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const [isPending, setIsPending] = useState(false);
    const { user } = useUser();

    const formatDateForInput = (date: any) => {
        if (!date) return '';
        const d = date.toDate ? date.toDate() : new Date(date);
        // Correct for timezone shift by adding the offset before formatting
        const offset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() + offset);
        return format(localDate, 'yyyy-MM-dd');
    };
    
    const [idPrefix, idNumber] = sale.customerIdentification.split('-');
    const phonePrefix = sale.customerPhone?.substring(3,6) || '';
    const phoneNumber = sale.customerPhone?.substring(6) || '';


    const form = useForm<CreateSaleValues>({
      resolver: zodResolver(CreateSaleSchema),
      defaultValues: {
        ...sale,
        saleDate: formatDateForInput(sale.saleDate),
        dueDate: formatDateForInput(sale.dueDate),
        firstPaymentDate: formatDateForInput(sale.firstPaymentDate),
        customerEmail: sale.customerEmail || '',
        idPrefix: idPrefix,
        idNumber: idNumber,
        phonePrefix: phonePrefix,
        phoneNumber: phoneNumber,
        salesPerson: sale.salesPerson || '',
      },
    });

    const { watch, setValue } = form;
    const amount = watch('amount');
    const downPaymentType = watch('downPaymentType');
    const downPaymentValue = watch('downPaymentValue');
    const numberOfInstallments = watch('numberOfInstallments');
    const firstPaymentDate = watch('firstPaymentDate');
    const paymentFrequency = watch('paymentFrequency');
    const saleDate = watch('saleDate');
    const newIdPrefix = watch('idPrefix');
  
    useEffect(() => {
        const totalAmount = Number(amount) || 0;
        const dpValue = Number(downPaymentValue) || 0;
        const installments = Number(numberOfInstallments) || 1;

        let balance = totalAmount;
        if (!isRentalPlan) {
            let downPayment = 0;
            if (downPaymentType === 'Porcentaje') {
                downPayment = totalAmount * (dpValue / 100);
            } else {
                downPayment = dpValue;
            }
            balance = totalAmount - downPayment;
        }

        const installment = installments > 0 ? balance / installments : 0;
        
        const roundedInstallment = Math.round(installment * 100) / 100;
        const roundedBalance = Math.round(balance * 100) / 100;

        setValue('remainingBalance', roundedBalance < 0 ? 0 : roundedBalance);
        setValue('installmentAmount', roundedInstallment < 0 ? 0 : roundedInstallment);

    }, [amount, downPaymentType, downPaymentValue, numberOfInstallments, setValue, isRentalPlan]);
  
    useEffect(() => {
        if (firstPaymentDate && numberOfInstallments > 0 && paymentFrequency) {
            const startDate = parseISO(firstPaymentDate);
            if (isValid(startDate)) {
                let finalDueDate;
                const installments = numberOfInstallments - 1;

                switch (paymentFrequency) {
                    case 'Semanal':
                        finalDueDate = addWeeks(startDate, installments);
                        break;
                    case 'Quincenal':
                        finalDueDate = addWeeks(startDate, installments * 2);
                        break;
                    case 'Mensual':
                        finalDueDate = addMonths(startDate, installments);
                        break;
                    case 'Trimestral':
                        finalDueDate = addQuarters(startDate, installments);
                        break;
                    default:
                        return;
                }
                setValue('dueDate', format(finalDueDate, 'yyyy-MM-dd'));
            }
        }
    }, [firstPaymentDate, numberOfInstallments, paymentFrequency, setValue]);

    useEffect(() => {
        if (saleDate && paymentFrequency) {
            const startDate = new Date(`${saleDate}T00:00:00`);
            if (isValid(startDate)) {
                let firstPayment: Date;
                switch(paymentFrequency) {
                    case 'Semanal':
                        firstPayment = addDays(startDate, 7);
                        break;
                    case 'Quincenal':
                        firstPayment = addDays(startDate, 15);
                        break;
                    case 'Mensual':
                        firstPayment = addMonths(startDate, 1);
                        break;
                    case 'Trimestral':
                        firstPayment = addMonths(startDate, 3);
                        break;
                    default:
                        return;
                }
                setValue('firstPaymentDate', format(firstPayment, 'yyyy-MM-dd'));
            }
        }
    }, [saleDate, paymentFrequency, setValue]);

    useEffect(() => {
        if (newIdPrefix === 'V' || newIdPrefix === 'E') {
            setValue('customerType', 'Persona Natural');
        } else if (newIdPrefix === 'J') {
            setValue('customerType', 'Persona Juridica');
        } else if (newIdPrefix === 'G') {
            setValue('customerType', 'Ente Gubernamental');
        }
    }, [newIdPrefix, setValue]);


    const onSubmit = async (data: CreateSaleValues) => {
        if (!user || !sale.id) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo encontrar la información necesaria para actualizar la venta.',
            });
            return;
        }
      
        setIsPending(true);
        
        try {
            const result = await updateSale({
                vendorId: user.uid,
                saleId: sale.id,
                saleData: data,
            });

            if (result.success) {
                toast({
                    title: isRentalPlan ? 'Contrato Actualizado' : 'Venta Actualizada',
                    description: `El compromiso para ${data.customerName} ha sido actualizado.`,
                });
                onSaleUpdated();
                setOpen(false);
            } else {
                throw new Error(result.message);
            }
  
        } catch (error: any) {
            console.error("Error updating sale:", error);
            toast({
                variant: 'destructive',
                title: 'Error al actualizar',
                description: error.message || 'Ocurrió un error inesperado al guardar en la base de datos.',
            });
        } finally {
            setIsPending(false);
        }
    };
    
    const creditTypes = isRentalPlan ? [
        { value: "Alquiler Residencial", label: "Alquiler Residencial" },
        { value: "Alquiler Comercial", label: "Alquiler Comercial" },
        { value: "Arrendamiento", label: "Arrendamiento (General)" },
    ] : [
        { value: "Compra al Credito", label: "Compra al Crédito" },
        { value: "Financiamiento de Vehiculo", label: "Financiamiento de Vehículo" },
        { value: "Financiamiento de Moto", label: "Financiamiento de Moto" },
        { value: "Honorarios Profesionales", label: "Honorarios Profesionales" },
        { value: "Servicios", label: "Servicios" },
        { value: "Servicios Publicos", label: "Servicios Públicos" },
        { value: "Recibo Condominio", label: "Recibo Condominio" },
        { value: "Matricula", label: "Matrícula" },
        { value: "Matricula Educativa", label: "Matrícula Educativa" },
        { value: "Servicios de Salud", label: "Servicios de Salud" },
        { value: "Afiliacion", label: "Afiliación" },
    ];
  
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
            {children}
        </DialogTrigger>
        <DialogContent className="sm:max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] p-0 max-h-[90vh]">
           <DialogHeader className="p-6 pb-0">
            <DialogTitle>{isRentalPlan ? 'Editar Contrato de Alquiler' : 'Editar Venta a Crédito'}</DialogTitle>
            <DialogDescription>
              {isRentalPlan ? 'Modifique los detalles del contrato y del inquilino.' : 'Modifique los detalles de la venta y del cliente.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} id={`edit-sale-form-${sale.id}`} className="overflow-y-auto px-6 space-y-4">
                
                <div>
                  <FormLabel>Identificación del {isRentalPlan ? 'Inquilino' : 'Cliente'} *</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <FormField
                      control={form.control}
                      name="idPrefix"
                      render={({ field }) => (
                        <FormItem className="w-1/3">
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Prefijo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {idPrefixes.map(prefix => (
                                <SelectItem key={prefix} value={prefix}>{prefix}-</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="idNumber"
                      render={({ field }) => (
                        <FormItem className="w-2/3">
                          <FormControl>
                            <Input placeholder="12345678" {...field} disabled={isPending}/>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del {isRentalPlan ? 'Inquilino' : 'Cliente'} *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="customerEmail"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Correo Electrónico</FormLabel>
                      <FormControl>
                          <Input type="email" placeholder="cliente@ejemplo.com" {...field} />
                      </FormControl>
                      <FormMessage />
                      </FormItem>
                  )}
                />

                <div>
                  <FormLabel>Teléfono del {isRentalPlan ? 'Inquilino' : 'Cliente'} *</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <FormField
                      control={form.control}
                      name="phonePrefix"
                      render={({ field }) => (
                        <FormItem className="w-1/3">
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Prefijo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {phonePrefixes.map(prefix => (
                                <SelectItem key={prefix} value={prefix}>{prefix}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem className="w-2/3">
                          <FormControl>
                            <Input type="tel" placeholder="1234567" maxLength={7} {...field} disabled={isPending} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                 <FormField
                  control={form.control}
                  name="customerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de {isRentalPlan ? 'Inquilino' : 'Cliente'} *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Persona Natural">Persona Natural</SelectItem>
                          <SelectItem value="Persona Juridica">Persona Jurídica</SelectItem>
                          <SelectItem value="Ente Gubernamental">Ente Gubernamental</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="creditType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Compromiso *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                           {creditTypes.map(type => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                    control={form.control}
                    name="salesPerson"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Vendedor / Asesor</FormLabel>
                        <FormControl>
                        <Input placeholder="Nombre del asesor" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="invoiceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isRentalPlan ? 'Número de Contrato' : 'Número de Documento'} *</FormLabel>
                        <FormControl>
                            <Input placeholder={isRentalPlan ? "CON-001" : "DOC-001"} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </div>

                <FormField
                  control={form.control}
                  name="items"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRentalPlan ? 'Descripción (Inmueble/Unidad)' : 'Items Vendidos'}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={isRentalPlan ? "Ej: Apto 3, Res. Sol" : "Descripción de los productos o servicios"} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isRentalPlan ? 'Monto Total del Contrato' : 'Monto Total (Documento)'} *</FormLabel>
                        <FormControl>
                          <Input type="number" step="any" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="downPaymentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de {isRentalPlan ? 'Depósito' : 'Inicial'} *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Monto Fijo">Monto Fijo</SelectItem>
                            <SelectItem value="Porcentaje">Porcentaje</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="downPaymentValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                           {watch('downPaymentType') === 'Monto Fijo' ? `Monto del ${isRentalPlan ? 'Depósito' : 'Inicial'} ($) *` : `Porcentaje del ${isRentalPlan ? 'Depósito' : 'Inicial'} (%) *`}
                        </FormLabel>
                        <FormControl>
                          <Input type="number" step="any" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="remainingBalance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isRentalPlan ? 'Saldo a Financiar (si aplica)' : 'Saldo a Financiar'} *</FormLabel>
                        <FormControl>
                          <Input type="number" step="any" {...field} readOnly className="bg-muted" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="numberOfInstallments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isRentalPlan ? 'Duración del Contrato (Meses)' : 'Número de Cuotas'} *</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                   control={form.control}
                   name="installmentAmount"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>{isRentalPlan ? 'Canon de Arrendamiento (Calculado)' : 'Monto de Cuota (Calculado)'} *</FormLabel>
                       <FormControl>
                         <Input type="number" step="any" {...field} readOnly className="bg-muted" />
                       </FormControl>
                       <FormMessage />
                     </FormItem>
                   )}
                 />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                   <FormField
                    control={form.control}
                    name="saleDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isRentalPlan ? 'Fecha del Contrato' : 'Fecha de Venta'} *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="paymentFrequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frecuencia de Pago *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione frecuencia" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Semanal">Semanal</SelectItem>
                            <SelectItem value="Quincenal">Quincenal</SelectItem>
                            <SelectItem value="Mensual">Mensual</SelectItem>
                            <SelectItem value="Trimestral">Trimestral</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstPaymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha Primer Pago *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha de Vencimiento Final *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} readOnly className="bg-muted"/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
          </Form>
          <DialogFooter className="p-6 pt-4 border-t mt-4">
                <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={isPending}>
                        Cancelar
                    </Button>
                </DialogClose>
                <Button type="submit" form={`edit-sale-form-${sale.id}`} disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Cambios
                </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
}

function RequestModificationDialog({ sale, children, onAction, type }: { sale: CreditSale, children: React.ReactNode, onAction: () => void, type: 'suspension' | 'deletion' }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const [isPending, setIsPending] = useState(false);
    const { user } = useUser();
    const [reason, setReason] = useState('');
  
    const isDeletion = type === 'deletion';

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !sale) return;
      if (!reason.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Por favor, indica el motivo.' });
        return;
      }
  
      setIsPending(true);
      try {
        const result = isDeletion 
            ? await requestSaleDeletion({ vendorId: user.uid, saleId: sale.id, reason: reason })
            : await requestSaleSuspension({ vendorId: user.uid, saleId: sale.id, reason: reason });
  
        if (result.success) {
          toast({
            title: 'Solicitud Enviada',
            description: result.message,
          });
          onAction();
          setOpen(false);
        } else {
          throw new Error(result.message);
        }
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error al solicitar',
          description: error.message || 'Ocurrió un error inesperado.',
        });
      } finally {
        setIsPending(false);
      }
    };
  
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isDeletion ? 'Solicitar Eliminación de Crédito' : 'Solicitar Suspensión de Crédito'}</DialogTitle>
            <DialogDescription>
              {isDeletion 
                ? 'Esta acción solicita al administrador borrar permanentemente este crédito. Útil para corregir errores de registro.' 
                : 'Esta acción solicita al administrador congelar este crédito. El cliente ya no recibirá recordatorios.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mod-reason">Motivo detallado</Label>
              <Textarea 
                id="mod-reason" 
                placeholder="Explica el motivo de tu solicitud..." 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={isPending}>Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={isPending} variant={isDeletion ? 'destructive' : 'default'}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isDeletion ? 'Solicitar Eliminación' : 'Solicitar Suspensión'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
}

function RejectPaymentDialog({ payment, sale, onAction }: { payment: Payment, sale: CreditSale, onAction: () => void }) {
    const { user } = useUser();
    const { toast } = useToast();
    const [reason, setReason] = useState('');
    const [isPending, setIsPending] = useState(false);
    const [open, setOpen] = useState(false);

    const handleReject = async () => {
        if (!user) return;
        if (!reason) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Debes indicar un motivo para el rechazo.',
            });
            return;
        }

        setIsPending(true);
        try {
            const result = await rejectPaymentByVendor({
                vendorId: user.uid,
                saleId: sale.id,
                paymentId: payment.id,
                reason,
            });

            if (result.success) {
                toast({ title: 'Pago Rechazado' });
                onAction();
                setOpen(false);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al rechazar', description: error.message });
        } finally {
            setIsPending(false);
        }
    };
    
    return (
         <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                 <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-600 hover:bg-red-50">Rechazar</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Rechazar Pago</AlertDialogTitle>
                    <AlertDialogDescription>
                       Por favor, indica el motivo por el cual se rechaza este pago.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                    <Label htmlFor="reason">Motivo del Rechazo</Label>
                    <Textarea 
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ej: El pago no se refleja en la cuenta bancaria."
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReject} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar Rechazo
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function VoidPaymentDialog({ payment, sale, onAction }: { payment: Payment, sale: CreditSale, onAction: () => void }) {
    const { user } = useUser();
    const { toast } = useToast();
    const [reason, setReason] = useState('');
    const [isPending, setIsPending] = useState(false);
    const [open, setOpen] = useState(false);

    const handleVoid = async () => {
        if (!user) return;
        if (!reason) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debes indicar un motivo para la anulación.' });
            return;
        }

        setIsPending(true);
        try {
            const result = await voidPaymentByVendor({
                vendorId: user.uid,
                saleId: sale.id,
                paymentId: payment.id,
                reason,
            });

            if (result.success) {
                toast({ title: 'Pago Anulado', description: 'El pago ha sido invalidado y el saldo restaurado.' });
                onAction();
                setOpen(false);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al anular', description: error.message });
        } finally {
            setIsPending(false);
        }
    };
    
    return (
         <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                 <Button variant="ghost" size="sm" className="text-orange-600 hover:text-orange-600 hover:bg-orange-50">
                    <Ban className="h-3 w-3 mr-1" /> Anular
                 </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Anular Pago Verificado</AlertDialogTitle>
                    <AlertDialogDescription>
                       Esta acción marcará el pago como **Anulado** y restaurará el saldo pendiente de la factura. ¿Por qué deseas anular este pago?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                    <Label htmlFor="void-reason">Motivo de Anulación</Label>
                    <Textarea 
                        id="void-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ej: Error en el monto registrado o cheque devuelto."
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleVoid} disabled={isPending} className="bg-orange-600 hover:bg-orange-700">
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar Anulación
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function SaleCard({ sale, forceUpdate, isRentalPlan }: { sale: CreditSale, forceUpdate: () => void, isRentalPlan: boolean }) {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const isEditable = sale.status !== 'Pagado' && sale.status !== 'Solicitud de Suspension' && sale.status !== 'Solicitud de Eliminacion' && sale.status !== 'Cerrado Administrativamente';

    const statusColors: { [key: string]: string } = {
        'Pagado': 'bg-green-100 text-green-800',
        'Pendiente': 'bg-yellow-100 text-yellow-800',
        'Vencido': 'bg-red-100 text-red-800',
        'Pendiente de Confirmación': 'bg-blue-100 text-blue-800',
        'Solicitud de Suspension': 'bg-purple-100 text-purple-800',
        'Solicitud de Eliminacion': 'bg-orange-100 text-orange-800',
        'Cerrado Administrativamente': 'bg-gray-100 text-gray-800',
    };

    const formatDate = (date: any) => {
        if (!date) return 'N/A';
        const d = date.toDate ? date.toDate() : new Date(date);
        // Robust correction for date-only values to avoid one-day-off errors
        const userTimezoneOffset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() + userTimezoneOffset);
        return format(localDate, 'dd/MM/yyyy');
    };
  
    const paymentsQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return query(collection(firestore, 'vendors', user.uid, 'sales', sale.id, 'payments'));
    }, [user, firestore, sale.id]);

    const { data: remotePayments } = useCollection<Payment>(paymentsQuery);

    const handleVerify = async (paymentId: string) => {
        if (!user) return;
        try {
            const result = await verifyPaymentByVendor({
                vendorId: user.uid,
                saleId: sale.id,
                paymentId: paymentId
            });
            if (result.success) {
                toast({ title: 'Pago Verificado', description: 'El pago ha sido confirmado y aplicado al saldo.' });
                forceUpdate();
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Error al verificar', description: error.message });
        }
    };
    
    const verifiedPayments = useMemo(() => remotePayments?.filter(p => p.status === 'Verificado') ?? [], [remotePayments]);
    const pendingPayments = useMemo(() => remotePayments?.filter(p => p.status === 'Pendiente de Verificación') ?? [], [remotePayments]);
    const sortedPayments = useMemo(() => remotePayments?.sort((a,b) => (b.paymentDate.toDate ? b.paymentDate.toDate() : new Date(b.paymentDate)).getTime() - (a.paymentDate.toDate ? a.paymentDate.toDate() : new Date(a.paymentDate)).getTime()) ?? [], [remotePayments]);
  
    const totalPaid = useMemo(() => {
        const installmentPaymentsTotal = verifiedPayments.reduce((sum, payment) => sum + payment.amount, 0);
        return (sale.downPaymentAmount || 0) + installmentPaymentsTotal;
    }, [verifiedPayments, sale.downPaymentAmount]);

    const pendingBalance = sale.amount - totalPaid;

    const amortizationSchedule = useMemo(() => {
        if (!sale.firstPaymentDate || !sale.numberOfInstallments) return [];
    
        const schedule = [];
        const firstPaymentDateSrc = sale.firstPaymentDate.toDate ? sale.firstPaymentDate.toDate() : new Date(sale.firstPaymentDate);
        
        // Ensure firstPaymentDate is local midnight
        const offset = firstPaymentDateSrc.getTimezoneOffset() * 60000;
        const firstPaymentDate = new Date(firstPaymentDateSrc.getTime() + offset);

        const paymentsGroupedByInstallment: Record<number, { amount: number; latestPaymentDate: Date }> = {};
        verifiedPayments.forEach(p => {
            if (p.appliedToInstallments) {
                for (const instNumStr in p.appliedToInstallments) {
                    const installment = parseInt(instNumStr, 10);
                    if (!paymentsGroupedByInstallment[installment]) {
                        paymentsGroupedByInstallment[installment] = { amount: 0, latestPaymentDate: new Date(0) };
                    }
                    paymentsGroupedByInstallment[installment].amount += p.appliedToInstallments[instNumStr];
                    const paymentDate = p.paymentDate.toDate ? p.paymentDate.toDate() : new Date(p.paymentDate);
                    if (paymentDate > paymentsGroupedByInstallment[installment].latestPaymentDate) {
                        paymentsGroupedByInstallment[installment].latestPaymentDate = paymentDate;
                    }
                }
            }
        });


        for (let i = 1; i <= sale.numberOfInstallments; i++) {
            let dueDate: Date;
            const index = i - 1;
            switch (sale.paymentFrequency) {
                case 'Semanal': dueDate = addWeeks(firstPaymentDate, index); break;
                case 'Quincenal': dueDate = addWeeks(firstPaymentDate, index * 2); break;
                case 'Mensual': dueDate = addMonths(firstPaymentDate, index); break;
                case 'Trimestral': dueDate = addQuarters(firstPaymentDate, index); break;
                default: dueDate = new Date();
            }

            const totalPaidForInstallment = paymentsGroupedByInstallment[i]?.amount || 0;
            const pendingForInstallment = Math.max(0, sale.installmentAmount - totalPaidForInstallment);
            const isPaid = pendingForInstallment < 0.01;
            const status: 'Pagado' | 'Parcial' | 'Pendiente' = isPaid ? 'Pagado' : (totalPaidForInstallment > 0 ? 'Parcial' : 'Pendiente');

            let daysOverdue = 0;
            const today = startOfDay(new Date());

            if (isPaid) {
                const latestPaymentDate = paymentsGroupedByInstallment[i].latestPaymentDate;
                if (startOfDay(latestPaymentDate) > startOfDay(dueDate)) {
                    daysOverdue = differenceInDays(startOfDay(latestPaymentDate), startOfDay(dueDate));
                }
            } else if (startOfDay(dueDate) < today) {
                daysOverdue = differenceInDays(today, startOfDay(dueDate));
            }
    
            schedule.push({
                installmentNumber: i,
                dueDate: format(dueDate, 'dd/MM/yyyy'),
                amount: sale.installmentAmount,
                amountPaid: totalPaidForInstallment,
                pending: pendingForInstallment,
                status: status,
                daysOverdue: daysOverdue,
            });
        }
        return schedule;
    }, [sale, verifiedPayments]);

    return (
        <Card id={sale.id}>
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between">
                <div className="flex-1">
                <CardTitle className="text-lg">{sale.customerName}</CardTitle>
                <CardDescription>
                    ID {isRentalPlan ? 'Inquilino' : 'Cliente'}: {sale.customerIdentification}
                </CardDescription>
                </div>
                <div className="flex items-center gap-2 mt-2 md:mt-0">
                    <div
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[sale.status || 'Pendiente']}`}
                    >
                        {sale.status}
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <EditSaleDialog sale={sale} onSaleUpdated={forceUpdate} isRentalPlan={isRentalPlan}>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={!isEditable}>
                                    <FilePenLine className="mr-2 h-4 w-4" />
                                    <span>{isRentalPlan ? 'Editar Contrato' : 'Editar'}</span>
                                </DropdownMenuItem>
                            </EditSaleDialog>
                            <PaymentDialog 
                                actorRole="vendor"
                                sale={sale} 
                                pendingBalance={pendingBalance} 
                                onPaymentReported={forceUpdate}
                                amortizationSchedule={amortizationSchedule}
                            >
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={!isEditable}>
                                    <Coins className="mr-2 h-4 w-4" />
                                    <span>Añadir Pago</span>
                                </DropdownMenuItem>
                            </PaymentDialog>
                            <DropdownMenuSeparator />
                            <RequestModificationDialog sale={sale} onAction={forceUpdate} type="suspension">
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-purple-600 focus:text-purple-600" disabled={!isEditable}>
                                    <PauseCircle className="mr-2 h-4 w-4" />
                                    <span>Solicitar Suspensión</span>
                                </DropdownMenuItem>
                            </RequestModificationDialog>
                            <RequestModificationDialog sale={sale} onAction={forceUpdate} type="deletion">
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-orange-600 focus:text-orange-600" disabled={!isEditable}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Solicitar Eliminación</span>
                                </DropdownMenuItem>
                            </RequestModificationDialog>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                <div className="space-y-2">
                    <p><strong>Tipo de {isRentalPlan ? 'Inquilino' : 'Cliente'}:</strong> {sale.customerType}</p>
                    <p><strong>Contacto:</strong> {sale.customerEmail} / {sale.customerPhone}</p>
                    <p className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <strong>Vendedor / Asesor:</strong> {sale.salesPerson || 'No asignado'}
                    </p>
                    <p><strong>Tipo de Compromiso:</strong> {sale.creditType}</p>
                    <p><strong>{isRentalPlan ? 'Contrato/Recibo:' : 'Documento:'}</strong> {sale.invoiceNumber}</p>
                    <p><strong>Monto Total:</strong> ${formatCurrency(sale.amount)}</p>
                    {isRentalPlan && sale.securityDepositAmount && sale.securityDepositAmount > 0 ? (
                        <p><strong>Depósito en Garantía:</strong> ${formatCurrency(sale.securityDepositAmount)}</p>
                    ) : (sale.downPaymentAmount || 0) > 0 ? (
                        <p><strong>Monto Inicial:</strong> ${formatCurrency(sale.downPaymentAmount || 0)}</p>
                    ) : null}
                    <p><strong>Monto Pagado:</strong> ${formatCurrency(totalPaid)}</p>
                    <p className={cn(pendingBalance > 0.01 && "text-destructive font-semibold")}><strong>Saldo Pendiente:</strong> ${formatCurrency(pendingBalance)}</p>
                    <p><strong>Fecha {isRentalPlan ? 'Contrato' : 'Venta'}:</strong> {formatDate(sale.saleDate)}</p>
                    <p><strong>Fecha Vencimiento:</strong> {formatDate(sale.dueDate)}</p>
                    <p className="text-muted-foreground pt-2"><strong>{isRentalPlan ? 'Inmueble:' : 'Items:'}</strong> {sale.items}</p>
                    {sale.suspensionReason && (
                        <div className={cn("mt-4 p-3 border rounded-md", sale.status === 'Solicitud de Eliminacion' ? "bg-orange-50 border-orange-100" : "bg-purple-50 border-purple-100")}>
                            <p className={cn("font-semibold flex items-center gap-2", sale.status === 'Solicitud de Eliminacion' ? "text-orange-800" : "text-purple-800")}>
                                {sale.status === 'Solicitud de Eliminacion' ? <Trash2 className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                                {sale.status === 'Solicitud de Eliminacion' ? 'Eliminación Solicitada:' : 'Suspensión Solicitada:'}
                            </p>
                            <p className={cn("italic mt-1", sale.status === 'Solicitud de Eliminacion' ? "text-orange-700" : "text-purple-700")}>{sale.suspensionReason}</p>
                        </div>
                    )}
                </div>
                <div className="border rounded-lg overflow-hidden">
                    <div className="relative w-full overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-center">Cuota</TableHead>
                                    <TableHead>Vencimiento</TableHead>
                                    <TableHead>Monto</TableHead>
                                    <TableHead>Pagado</TableHead>
                                    <TableHead className="text-center">Atraso</TableHead>
                                    <TableHead className="text-right">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {amortizationSchedule.map(item => (
                                    <TableRow key={item.installmentNumber}>
                                        <TableCell className="text-center font-medium">{item.installmentNumber}</TableCell>
                                        <TableCell>{item.dueDate}</TableCell>
                                        <TableCell>${formatCurrency(item.amount)}</TableCell>
                                        <TableCell className="text-green-600">${formatCurrency(item.amountPaid)}</TableCell>
                                        <TableCell className={cn(
                                            "text-center font-semibold",
                                            item.daysOverdue > 0 && item.status !== 'Pagado' && 'text-red-600',
                                            item.daysOverdue > 0 && item.status === 'Pagado' && 'text-muted-foreground'
                                        )}>
                                            {item.daysOverdue}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={
                                                item.status === 'Pagado' ? 'default' : 
                                                item.status === 'Parcial' ? 'secondary' : 'outline'
                                            } className={
                                                item.status === 'Pagado' ? 'bg-green-100 text-green-800' : 
                                                item.status === 'Parcial' ? 'bg-amber-100 text-amber-800' : ''
                                            }>{item.status}</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </CardContent>
            {(sortedPayments && sortedPayments.length > 0) ? (
                <CardFooter className="p-0 border-t">
                <Accordion type="single" collapsible className="w-full">
                     {pendingPayments && pendingPayments.length > 0 && (
                        <AccordionItem value="pending-payments">
                            <AccordionTrigger className="px-6 text-sm text-blue-600 font-semibold">Ver Pagos por Verificar ({pendingPayments.length})</AccordionTrigger>
                            <AccordionContent className="px-6 pb-4">
                                <div className="space-y-4 text-xs">
                                    {pendingPayments.map(p => (
                                        <div key={p.id} className="flex justify-between items-center p-2 rounded-md bg-blue-50">
                                            <div>
                                                <span>{formatDate(p.paymentDate)} - Monto: <span className="font-medium">${formatCurrency(p.amount)}</span></span>
                                                {p.referenceNumber && <span className="text-muted-foreground ml-2">(Ref: {p.referenceNumber})</span>}
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={() => handleVerify(p.id)}><Check className="mr-2 h-4 w-4" />Verificar</Button>
                                                <RejectPaymentDialog payment={p} sale={sale} onAction={forceUpdate} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                     )}
                    {sortedPayments && sortedPayments.length > 0 && (
                        <AccordionItem value="payments">
                        <AccordionTrigger className="px-6 text-sm">Ver Historial de Pagos ({sortedPayments.length})</AccordionTrigger>
                        <AccordionContent className="px-6 pb-4">
                        <div className="space-y-2 text-xs">
                            {sortedPayments.map(p => (
                            <div key={p.id} className="flex justify-between items-center group">
                                <div className="flex flex-col">
                                    <span>{formatDate(p.paymentDate)} - {p.paymentMethod}</span>
                                    {p.status === 'Anulado' && p.voidReason && <span className="text-[10px] text-muted-foreground italic">Motivo anulación: {p.voidReason}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col items-end">
                                        <span className="font-medium">${formatCurrency(p.amount)}</span>
                                        <Badge variant={p.status === 'Verificado' ? 'default' : p.status === 'Anulado' ? 'outline' : p.status === 'Rechazado' ? 'destructive' : 'secondary'} className={cn("text-[10px] h-4", p.status === 'Anulado' && 'border-orange-500 text-orange-600')}>{p.status}</Badge>
                                    </div>
                                    {p.status === 'Verificado' && (
                                        <VoidPaymentDialog payment={p} sale={sale} onAction={forceUpdate} />
                                    )}
                                </div>
                            </div>
                            ))}
                        </div>
                        </AccordionContent>
                    </AccordionItem>
                    )}
                </Accordion>
                </CardFooter>
            ): null}
        </Card>
    )
}

export default function SalesPage() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    const [searchTerm, setSearchTerm] = useState('');
    const [updateCounter, setUpdateCounter] = useState(0);
    const [vendorData, setVendorData] = useState<Vendor | null>(null);
    const [dataLoading, setDataLoading] = useState(true);

    const forceUpdate = () => setUpdateCounter(prev => prev + 1);

    const salesQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return query(collection(firestore, 'vendors', user.uid, 'sales'), orderBy('saleDate', 'desc'));
    }, [user, firestore, updateCounter]);

    const { data: sales, isLoading: salesLoading } = useCollection<CreditSale>(salesQuery);
    
    useEffect(() => {
        if (!user || !firestore) {
            setDataLoading(false);
            return;
        }

        const fetchInitialData = async () => {
            setDataLoading(true);
            try {
                const vendorRef = doc(firestore, "vendors", user.uid);
                const vendorSnap = await getDoc(vendorRef);
                if (vendorSnap.exists()) {
                    setVendorData(vendorSnap.data() as Vendor);
                }
            } catch (error) {
                console.error("Error fetching initial sales page data:", error);
            } finally {
                setDataLoading(false);
            }
        };

        fetchInitialData();
    }, [user, firestore, updateCounter]);

    const isLoading = userLoading || salesLoading || dataLoading;
    const isRentalPlan = vendorData?.plan === 'HistoAlquiler';

    const filteredSales = useMemo(() => {
        if (!sales) return [];
        if (!searchTerm) return sales;
    
        return sales.filter(sale => 
            sale.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            sale.customerIdentification.toLowerCase().includes(searchTerm.toLowerCase()) ||
            sale.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sale.salesPerson && sale.salesPerson.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [sales, searchTerm]);

    useEffect(() => {
        if (!isLoading && sales && sales.length > 0) {
            const hash = window.location.hash;
            if (hash) {
                setTimeout(() => {
                    const id = hash.replace('#', '');
                    const element = document.getElementById(id);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        element.style.transition = 'outline 0.2s ease-in-out';
                        element.style.outline = '2px solid hsl(var(--primary))';
                        setTimeout(() => {
                            element.style.outline = 'none';
                        }, 2000);
                    }
                }, 100);
            }
        }
    }, [isLoading, sales]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="w-full sm:w-auto text-center sm:text-left">
                    <h1 className="text-2xl font-bold">{isRentalPlan ? 'Gestión de Contratos' : 'Ventas a Crédito'}</h1>
                    <p className="text-muted-foreground">{isRentalPlan ? 'Administra tus contratos de alquiler y su estado.' : 'Administra tus ventas a crédito y su estado.'}</p>
                </div>
                <div className="flex w-full sm:w-auto items-center gap-2">
                    <div className="relative flex-1 sm:flex-initial sm:w-64">
                       <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Buscar por cliente, ID o documento..."
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <CreateSaleDialog onSaleCreated={forceUpdate} isRentalPlan={isRentalPlan} />
                </div>
            </div>
            
            {isLoading ? (
                <div className="flex h-96 w-full flex-col items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Cargando {isRentalPlan ? 'contratos' : 'ventas'}...</p>
                </div>
            ) : filteredSales && filteredSales.length > 0 ? (
                <div className="grid gap-6 lg:grid-cols-1">
                   {filteredSales.map(sale => <SaleCard key={sale.id} sale={sale} forceUpdate={forceUpdate} isRentalPlan={isRentalPlan}/>)}
                </div>
            ) : (
                <div className="flex h-96 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                    <div className="text-center">
                        <p className="text-lg font-medium">
                            {searchTerm ? `No se encontraron ${isRentalPlan ? 'contratos' : 'ventas'}` : `No hay ${isRentalPlan ? 'contratos' : 'ventas'} registrados`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                           {searchTerm 
                             ? 'Prueba con otro término de búsqueda.'
                             : `Haz clic en "${isRentalPlan ? 'Nuevo Contrato' : 'Nueva Venta'}" para registrar tu primer compromiso.`
                           }
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
