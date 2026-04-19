
'use client';

import { useEffect, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getEmailTemplates, saveEmailTemplates } from '@/ai/flows/email-templates-flow';
import type { EmailTemplates } from '@/lib/data';
import { EmailTemplatesSchema } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Info } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"


const formSchema = EmailTemplatesSchema;

type FormValues = z.infer<typeof formSchema>;

const availableVariables = [
    { variable: '{{customerName}}', description: 'Nombre completo del cliente.' },
    { variable: '{{vendorName}}', description: 'Nombre de tu comercio.' },
    { variable: '{{invoiceNumber}}', description: 'Número de la factura asociada.' },
    { variable: '{{paymentDate}}', description: 'Fecha del pago realizado (formato dd/MM/yyyy).' },
    { variable: '{{paymentAmount}}', description: 'Monto del pago realizado.' },
    { variable: '{{dueAmount}}', description: 'Monto total de la deuda o de la cuota pendiente.' },
    { variable: '{{totalAmount}}', description: 'Monto total de una nueva venta.' },
    { variable: '{{salesHistory}}', description: 'Resumen del estado de cuenta.' },
    { variable: '{{invoiceTable}}', description: 'Tabla de desglose de cargos (Solo Factura Mensual).' },
    { variable: '{{overdueInstallmentsTable}}', description: 'Tabla de cuotas vencidas (Solo Reporte Diario).' },
];

export default function EmailTemplatesPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newSaleConfirmation: { subject: '', body: '' },
      paymentNotification: { subject: '', body: '' },
      completion: { subject: '', body: '' },
      reminder: { subject: '', body: '' },
      overdue: { subject: '', body: '' },
      dailyOverdueReport: { subject: '', body: '' },
      monthlyInvoice: { subject: '', body: '' },
    },
  });

  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      try {
        const templates = await getEmailTemplates();
        if (templates) {
          form.reset(templates);
        }
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error al Cargar Plantillas',
          description: error.message || 'No se pudieron obtener las plantillas de correo.',
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplates();
  }, [form, toast]);

  const onSubmit = async (data: FormValues) => {
    setIsSaving(true);
    try {
      const result = await saveEmailTemplates(data);
      if (result.success) {
        toast({
          title: 'Plantillas Guardadas',
          description: 'Tus plantillas de correo han sido actualizadas exitosamente.',
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Guardar',
        description: error.message || 'No se pudieron guardar las plantillas.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Editor de Plantillas de Correo</CardTitle>
                <CardDescription>
                Personaliza el contenido de los correos automáticos que se envían a tus clientes.
                </CardDescription>
            </CardHeader>
        </Card>
        
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Accordion type="single" collapsible defaultValue="newSaleConfirmation" className="w-full">
                    <TemplateEditor form={form} name="newSaleConfirmation" title="Confirmación de Nueva Venta" description="Se envía al cliente cuando registras un nuevo crédito a su nombre." />
                    <TemplateEditor form={form} name="paymentNotification" title="Notificación de Pago" description="Se envía cuando se registra o verifica un pago parcial." />
                    <TemplateEditor form={form} name="completion" title="Notificación de Finalización de Crédito" description="Se envía cuando un cliente salda completamente una deuda." />
                    <TemplateEditor form={form} name="reminder" title="Recordatorio Amistoso (Automático)" description="Se envía automáticamente días antes del vencimiento de una cuota." />
                    <TemplateEditor form={form} name="overdue" title="Notificación de Atraso (Manual)" description="Se envía manualmente desde el reporte de cuentas por cobrar." />
                    <TemplateEditor form={form} name="monthlyInvoice" title="Factura Mensual a Comercio" description="Factura por el uso de la plataforma enviada cada mes." />
                    <TemplateEditor form={form} name="dailyOverdueReport" title="Reporte Diario de Cobranza" description="Resumen diario de cuotas vencidas enviado a los comercios." />
                </Accordion>
                
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Info className="h-5 w-5"/>Variables Disponibles</CardTitle>
                        <CardDescription>Usa estas variables en tus plantillas. Serán reemplazadas por el valor real al enviar el correo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            {availableVariables.map(v => (
                                <li key={v.variable}>
                                    <code className="font-mono bg-muted px-1.5 py-0.5 rounded-md">{v.variable}</code>
                                    <span className="text-muted-foreground ml-2">- {v.description}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Guardar Todas las Plantillas
                </Button>
                </div>
            </form>
        </Form>
    </div>
  );
}

interface TemplateEditorProps {
    form: UseFormReturn<FormValues>;
    name: keyof FormValues;
    title: string;
    description: string;
}

function TemplateEditor({ form, name, title, description }: TemplateEditorProps) {
    return (
        <AccordionItem value={name}>
            <AccordionTrigger className="text-lg font-semibold hover:no-underline">{title}</AccordionTrigger>
            <AccordionContent>
                <Card className="border-none shadow-none">
                    <CardDescription className="px-6 pb-4">{description}</CardDescription>
                    <CardContent className="space-y-4">
                    <FormField
                        control={form.control}
                        name={`${name}.subject`}
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Asunto del Correo</FormLabel>
                            <FormControl>
                            <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name={`${name}.body`}
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Cuerpo del Correo</FormLabel>
                            <FormControl>
                            <Textarea {...field} rows={10} placeholder="Escribe aquí el contenido del correo. Usa las variables disponibles." />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    </CardContent>
                </Card>
            </AccordionContent>
        </AccordionItem>
    );
}
