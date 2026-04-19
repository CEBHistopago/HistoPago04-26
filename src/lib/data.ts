import { z } from 'zod';

// Main entity for a vendor. The ID is the Firebase Auth UID.
export const VendorSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'vendor']).optional(),
  apiKey: z.string().optional(),
  identificationNumber: z.string().optional(),
  legalRepIdentificationNumber: z.string().optional(),
  // Fields for vendor profile
  address: z.string().optional(),
  phone: z.string().optional(),
  legalRepName: z.string().optional(),
  legalRepAddress: z.string().optional(),
  legalRepPhone: z.string().optional(),
  legalRepEmail: z.string().email().optional().or(z.literal('')),
  enableDailyReport: z.boolean().optional(),
  reminderDaysBefore: z.coerce.number().int().min(1).max(14).optional(), // Coerce to number
  // Fields for subscription management
  status: z.enum(['Activo', 'Inactivo', 'Suspendido']).optional(),
  subscriptionEndDate: z.any().optional(),
  creationDate: z.any().optional(),
  // Allow 'Comercio' for backward compatibility during data fetching.
  plan: z.enum(['HistoGestion', 'HistoAlquiler', 'Comercio']).optional(),
  fcmTokens: z.array(z.string()).optional(),
});
export type Vendor = z.infer<typeof VendorSchema>;

// Schema for a customer profile
export const CustomerSchema = z.object({
    email: z.string().email(),
    name: z.string(),
    identificationNumber: z.string(),
    phone: z.string().optional(),
    role: z.literal('customer').optional(),
    fcmTokens: z.array(z.string()).optional(),
    isRegistered: z.boolean().optional(),
});
export type Customer = z.infer<typeof CustomerSchema>;

// A credit sale made by a vendor. Customer info is embedded.
export const CreditSaleSchema = z.object({
  id: z.string(),
  createdBy: z.string(), // UID of the vendor who made the sale
  vendorName: z.string().optional(), // Name of the vendor
  customerName: z.string().min(1, { message: "El nombre del cliente es obligatorio." }),
  customerIdentification: z.string().min(1, { message: "La identificación del cliente es obligatoria." }),
  customerType: z.enum(['Persona Natural', 'Persona Juridica', 'Ente Gubernamental'], { required_error: "Debe seleccionar el tipo de cliente." }),
  customerEmail: z.string().email({ message: "Por favor, introduce un correo válido." }).nullable().optional().or(z.literal('')),
  customerPhone: z.string().optional(),
  creditType: z.enum(['Compra al Credito', 'Arrendamiento', 'Honorarios Profesionales', 'Servicios', 'Servicios Publicos', 'Matricula', 'Alquiler Residencial', 'Alquiler Comercial', 'Recibo Condominio', 'Servicios de Salud', 'Matricula Educativa', 'Afiliacion', 'Financiamiento de Vehiculo', 'Financiamiento de Moto'], { required_error: "Debe seleccionar el tipo de compromiso." }),
  invoiceNumber: z.string().min(1, { message: "El número de documento es obligatorio." }),
  amount: z.number().positive({ message: "El monto debe ser un número positivo." }),
  items: z.string().nullable().optional(),
  dueDate: z.any(), // Accept string from form, will be converted to Date
  saleDate: z.any(), // Accept string from form, will be converted to Date
  status: z.enum(['Pagado', 'Pendiente', 'Vencido', 'Pendiente de Confirmación', 'Solicitud de Suspension', 'Solicitud de Eliminacion', 'Cerrado Administrativamente']).optional(),
  
  // Asesor de ventas (Opcional)
  salesPerson: z.string().optional(),

  // Modification Request fields
  suspensionReason: z.string().optional(),
  suspensionRequestDate: z.any().optional(),

  // Down payment fields
  downPaymentType: z.enum(['Monto Fijo', 'Porcentaje']).optional(),
  downPaymentValue: z.number().min(0).optional(),
  downPaymentAmount: z.number().optional(), // Calculated field
  securityDepositAmount: z.number().optional(), // new field for rental deposits
  remainingBalance: z.number().min(0).optional(),
  
  numberOfInstallments: z.number().int().positive({ message: "El número de cuotas debe ser un entero positivo." }),
  installmentAmount: z.number().positive({ message: "El monto de la cuota debe ser un número positivo." }),
  paymentFrequency: z.enum(['Semanal', 'Quincenal', 'Mensual', 'Trimestral']),
  firstPaymentDate: z.any(), // Accept string from form, will be converted to Date
  paidInstallments: z.number().optional(),
  pendingInstallments: z.number().optional(),
  totalPaid: z.number().optional(),
});
export type CreditSale = z.infer<typeof CreditSaleSchema>;

// Schema for creating a new sale, omitting server-generated fields.
export const CreateSaleSchema = z.object({
  // Customer Info
  customerName: z.string().min(1, { message: "El nombre del cliente es obligatorio." }),
  idPrefix: z.string().min(1, 'Selecciona un prefijo.'),
  idNumber: z.string().min(7, 'El número de identificación debe tener al menos 7 dígitos.'),
  customerEmail: z.string().email({ message: "Por favor, introduce un correo válido." }).nullable().optional().or(z.literal('')),
  phonePrefix: z.string().optional(),
  phoneNumber: z.string().optional(),
  customerType: z.enum(['Persona Natural', 'Persona Juridica', 'Ente Gubernamental'], { required_error: "Debe seleccionar el tipo de cliente." }),

  // Sale Details
  creditType: z.enum(['Compra al Credito', 'Arrendamiento', 'Honorarios Profesionales', 'Servicios', 'Servicios Publicos', 'Matricula', 'Alquiler Residencial', 'Alquiler Comercial', 'Recibo Condominio', 'Servicios de Salud', 'Matricula Educativa', 'Afiliacion', 'Financiamiento de Vehiculo', 'Financiamiento de Moto'], { required_error: "Debe seleccionar el tipo de compromiso." }),
  invoiceNumber: z.string().min(1, { message: "El número de documento es obligatorio." }),
  items: z.string().nullable().optional(),
  amount: z.coerce.number().positive({ message: "El monto debe ser un número positivo." }),
  
  // Asesor de ventas (Opcional)
  salesPerson: z.string().optional(),

  // Payment Structure
  downPaymentType: z.enum(['Monto Fijo', 'Porcentaje'], { required_error: "Debe seleccionar un tipo de inicial." }),
  downPaymentValue: z.coerce.number().min(0, { message: "El valor de la inicial no puede ser negativo."}),
  remainingBalance: z.coerce.number().min(0, { message: "El saldo a financiar no puede ser negativo."}).optional(),
  numberOfInstallments: z.coerce.number().int().positive({ message: "El número de cuotas debe ser un entero positivo." }),
  installmentAmount: z.coerce.number().min(0, { message: "El monto de la cuota no puede ser negativo." }).optional(),

  // Dates
  saleDate: z.string().min(1, { message: "La fecha de venta es obligatoria." }),
  paymentFrequency: z.enum(['Semanal', 'Quincenal', 'Mensual', 'Trimestral']),
  firstPaymentDate: z.string().min(1, { message: "La fecha del primer pago es obligatoria." }),
  dueDate: z.string().min(1, { message: "La fecha de vencimiento es obligatoria." }).optional(),
});
export type CreateSaleValues = z.infer<typeof CreateSaleSchema>;


// A payment made by a customer for a specific credit sale.
export const PaymentSchema = z.object({
  id: z.string(),
  creditSaleId: z.string(),
  paymentDate: z.any(),
  amount: z.number().positive({ message: "El monto debe ser un número positivo." }),
  paymentMethod: z.enum(['Efectivo', 'Transferencia', 'Pago Movil', 'CriptoActivo', 'Zelle', 'Transferencia Internacional', 'Punto de Venta']),
  referenceNumber: z.string().optional(),
  receiptImageUrl: z.string().url().optional().or(z.literal('')),
  
  // Server-side fields
  status: z.enum(['Pendiente de Verificación', 'Verificado', 'Rechazado', 'Anulado']).optional(),
  rejectionReason: z.string().optional(),
  voidReason: z.string().optional(), // Reason for voiding a payment
  reportedBy: z.enum(['vendor', 'customer']).optional(),
  installmentNumber: z.number().int().optional(), // LEGACY, use appliedToInstallments
  appliedToInstallments: z.record(z.number()).optional(), // e.g., { "1": 50, "2": 25 }
});
export type Payment = z.infer<typeof PaymentSchema>;

export const CreatePaymentSchema = z.object({
    amount: z.coerce.number().positive({ message: "El monto del pago debe ser positivo." }),
    paymentDate: z.string().min(1, { message: "La fecha de pago es obligatoria." }),
    paymentMethod: z.enum(['Efectivo', 'Transferencia', 'Pago Movil', 'CriptoActivo', 'Zelle', 'Transferencia Internacional', 'Punto de Venta'], {
        required_error: "Debe seleccionar un método de pago."
    }),
    referenceNumber: z.string().optional(),
    receiptImageUrl: z.string().url('Por favor, introduce una URL válida.').optional().or(z.literal('')),
});
export type CreatePaymentValues = z.infer<typeof CreatePaymentSchema>;


// A report of a customer default.
export const DefaultReportSchema = z.object({
    id: z.string(),
    creditSaleId: z.string(),
    reportDate: z.any(),
    reason: z.string().min(1, { message: "El motivo es obligatorio." }),
    installmentInDefault: z.number().int().positive({ message: "El número de cuota es obligatorio." }),
    defaultAmount: z.number().positive({ message: "El monto del incumplimiento debe ser positivo." }),
});
export type DefaultReport = z.infer<typeof DefaultReportSchema>;

export const CreateDefaultReportSchema = DefaultReportSchema.omit({
    id: true,
    creditSaleId: true,
}).extend({
    reportDate: z.string().min(1, { message: "La fecha del reporte es obligatoria." }),
    installmentInDefault: z.coerce.number().int().min(1, { message: "El número de cuota debe ser al menos 1." }),
    defaultAmount: z.coerce.number().positive({ message: "El monto del incumplimiento debe ser positivo." }),
});
export type CreateDefaultReportValues = z.infer<typeof CreateDefaultReportSchema>;


// Schemas for Customer History Flow
export const GetCustomerHistoryInputSchema = z.object({
  customerIdentification: z.string().describe("The customer's identification number."),
  vendorId: z.string().optional().describe("Optional: El UID de un comercio específico para filtrar el historial."),
});
export type GetCustomerHistoryInput = z.infer<typeof GetCustomerHistoryInputSchema>;

export type CreditSaleWithPayments = z.infer<typeof CreditSaleSchema> & { payments: z.infer<typeof PaymentSchema>[] };

const InstallmentSchema = z.object({
    saleId: z.string(),
    invoiceNumber: z.string(),
    vendorName: z.string(),
    installmentNumber: z.number(),
    dueDate: z.string(),
    amount: z.number(),
    status: z.enum(['Pagado', 'Vencido', 'Pendiente']),
});
export type Installment = z.infer<typeof InstallmentSchema>;

export const GetCustomerHistoryOutputSchema = z.object({
  history: z.array(CreditSaleSchema.extend({
      payments: z.array(PaymentSchema)
  })).describe("Listado de ventas con sus pagos correspondientes."),
  stats: z.object({
    totalSales: z.number(),
    totalAmount: z.number(),
    totalPaid: z.number(),
    totalDebt: z.number(),
    activeCredits: z.number(),
    paidCredits: z.number(),
    overdueCredits: z.number(),
    creditScore: z.number(),
    pendingConfirmationCount: z.number(),
    pendingVerificationCount: z.number(),
  }).describe("Estadísticas agregadas del historial del cliente."),
  paymentSchedule: z.array(InstallmentSchema).describe("Cronograma de cuotas próximas y vencidas."),
});
export type GetCustomerHistoryOutput = z.infer<typeof GetCustomerHistoryOutputSchema>;


// Static data for the sales chart, will be replaced with dynamic data later.
export const monthlySalesChartData = [
  { month: 'Jan', sales: 0 },
  { month: 'Feb', sales: 0 },
  { month: 'Mar', sales: 0 },
  { month: 'Apr', sales: 0 },
  { month: 'May', sales: 0 },
  { month: 'Jun', sales: 0 },
];

export interface CustomerIndex {
  id: string;
  vendorIds: string[];
}

export interface AgingReportData {
    customerName: string;
    customerIdentification: string;
    customerEmail?: string | null;
    customerPhone?: string;
    totalDue: number;
    salesCount: number;
    current: number;
    days1_30: number;
    days31_60: number;
    days61_90: number;
    days91_plus: number;
    salesHistory: { invoiceNumber: string, remainingBalance: number }[];
    nextInstallmentAmount: number;
}

// Client Summary types
export const ClientSummarySchema = z.object({
    id: z.string(), // customerIdentification
    name: z.string(),
    activeCredits: z.number(),
    totalCreditAmount: z.number(),
    totalPaid: z.number(),
    pendingBalance: z.number(),
    status: z.enum(['Al Día', 'Vencido']),
});
export type ClientSummary = z.infer<typeof ClientSummarySchema>;


// Email Reminder Flow Schemas
export const SendReminderInputSchema = z.object({
  to: z.string(),
  vendorName: z.string(),
  vendorEmail: z.string().optional(),
  emailType: z.enum(['newSaleConfirmation', 'paymentNotification', 'completion', 'reminder', 'overdue', 'dailyOverdueReport', 'monthlyInvoice']),
  // Optional fields, their presence depends on the emailType
  customerName: z.string().optional(),
  dueAmount: z.number().optional(),
  dueDate: z.string().optional(),
  salesHistory: z.string().optional(),
  paymentAmount: z.number().optional(),
  totalAmount: z.number().optional(),
  paymentDate: z.string().optional(),
  invoiceNumber: z.string().optional(),
  // For daily report
  reportDate: z.string().optional(),
  totalOverdueAmount: z.string().optional(),
  overdueClientsCount: z.number().optional(),
  overdueInstallmentsTable: z.string().optional(),
  // For monthly invoice
  period: z.string().optional(),
  invoiceDate: z.string().optional(),
  invoiceTable: z.string().optional(),
});
export type SendReminderInput = z.infer<typeof SendReminderInputSchema>;

export const SendReminderOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  id: z.string().optional(),
});
export type SendReminderOutput = z.infer<typeof SendReminderOutputSchema>;


// Vendor Profile Schema for edit form
export const VendorProfileSchema = z.object({
    name: z.string().min(1, 'El nombre completo es obligatorio.'),
    email: z.string().email('Correo electrónico no válido.'),
    identificationNumber: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    legalRepName: z.string().optional(),
    legalRepIdentificationNumber: z.string().optional(),
    legalRepAddress: z.string().optional(),
    legalRepPhone: z.string().optional(),
    legalRepEmail: z.string().email('Correo electrónico del representante no válido.').optional().or(z.literal('')),
    creationDate: z.string().optional(),
    enableDailyReport: z.boolean().optional(),
    reminderDaysBefore: z.coerce.number().int().min(1).max(14).optional(), // Coerce text from select to number
});
export type VendorProfileValues = z.infer<typeof VendorProfileSchema>;

// Subscription Management Schema
export const SubscriptionManagementSchema = z.object({
    status: z.enum(['Activo', 'Inactivo', 'Suspendido'], { required_error: 'El estado es obligatorio.' }),
    subscriptionEndDate: z.string().min(1, { message: "La fecha de fin de suscripción es obligatoria." }),
    plan: z.enum(['HistoGestion', 'HistoAlquiler'], { required_error: 'El plan es obligatorio.' }),
});
export type SubscriptionManagementValues = z.infer<typeof SubscriptionManagementSchema>;

// Subscription Payment Schema
export const SubscriptionPaymentSchema = z.object({
    id: z.string(),
    vendorId: z.string(),
    paymentDate: z.any(),
    amount: z.number().positive(),
    monthsPaid: z.number().int().positive(),
    newExpiryDate: z.any(),
    paymentMethod: z.enum(['Transferencia', 'Efectivo', 'Otro']),
    referenceNumber: z.string().optional().default(''),
});
export type SubscriptionPayment = z.infer<typeof SubscriptionPaymentSchema>;

export const CreateSubscriptionPaymentSchema = SubscriptionPaymentSchema.omit({
    id: true,
    vendorId: true,
    newExpiryDate: true,
}).extend({
    paymentDate: z.string().min(1, 'La fecha de pago es obligatoria.'),
    amount: z.coerce.number().positive('El monto debe ser positivo.'),
    monthsPaid: z.coerce.number().int().min(1, 'Debe indicar al menos un mes.'),
});
export type CreateSubscriptionPaymentValues = z.infer<typeof CreateSubscriptionPaymentSchema>;

// Subscription Payment Report Schema
export const SubscriptionPaymentReportSchema = z.object({
    id: z.string(),
    vendorId: z.string(),
    vendorName: z.string().optional(),
    reportDate: z.any(),
    paymentDate: z.any(),
    amount: z.number().positive(),
    monthsPaid: z.number().int().positive(),
    paymentMethod: z.enum(['Transferencia', 'Efectivo', 'Otro', 'Pago Movil', 'Zelle']),
    referenceNumber: z.string().optional(),
    status: z.enum(['Pendiente de Verificación', 'Verificado']),
});
export type SubscriptionPaymentReport = z.infer<typeof SubscriptionPaymentReportSchema>;


// Dashboard Stats Schema
export const DashboardStatsSchema = z.object({
    totalRevenue: z.number(),
    activeCredits: z.number(),
    totalSales: z.number(),
    overdueCount: z.number(),
    totalReceivableToDate: z.number(),
    pendingConfirmationCount: z.number(),
    vendorPlan: z.enum(['HistoGestion', 'HistoAlquiler']),
    dailyManagementStats: z.object({
        clientsContacted: z.number(),
        notifications: z.object({
            whatsapp: z.number(),
            sms: z.number(),
            email: z.number(),
            push: z.number(),
        }),
    }),
    totalClients: z.number(),
});
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;

// Customer Profile Schema for edit form
export const CustomerProfileSchema = z.object({
    name: z.string().min(1, 'El nombre es obligatorio.'),
    email: z.string().email('El correo electrónico no es válido.'),
    identificationNumber: z.string().min(1, 'El número de identificación es obligatorio.'),
    phone: z.string().optional(),
    fcmTokens: z.array(z.string()).optional(),
});
export type CustomerProfileValues = z.infer<typeof CustomerProfileSchema>;

// Bulk Import Report Schema
export const BulkImportReportSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  importType: z.enum(['Ventas', 'Pagos']),
  reportDate: z.any(),
  processed: z.number(),
  skipped: z.number(),
  errors: z.array(z.string()),
  importedBy: z.string(),
});
export type BulkImportReport = z.infer<typeof BulkImportReportSchema>;


// Email Templates
const EmailTemplateSchema = z.object({
  subject: z.string(),
  body: z.string(),
});
export const EmailTemplatesSchema = z.object({
  newSaleConfirmation: EmailTemplateSchema,
  paymentNotification: EmailTemplateSchema,
  completion: EmailTemplateSchema,
  reminder: EmailTemplateSchema,
  overdue: EmailTemplateSchema,
  dailyOverdueReport: EmailTemplateSchema,
  monthlyInvoice: EmailTemplateSchema,
});
export type EmailTemplates = z.infer<typeof EmailTemplatesSchema>;

// Invoice Schema
export const InvoiceItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
});
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;

export const InvoiceSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  invoiceDate: z.any(),
  periodStart: z.any(),
  periodEnd: z.any(),
  status: z.enum(['Pendiente', 'Pagado']),
  items: z.array(InvoiceItemSchema),
  totalAmount: z.number(),
  activeCreditsList: z.array(z.string()).optional(), // List of invoiceNumbers for transparency
});
export type Invoice = z.infer<typeof InvoiceSchema>;

// Billing Summary Schemas
export const BillingSummaryItemSchema = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  newCredits: z.number(),
  activeLegacyCredits: z.number(),
  activeCredits: z.number(),
  baseFee: z.number(),
  variableAmount: z.number(),
  billableAmount: z.number(),
});
export type BillingSummaryItem = z.infer<typeof BillingSummaryItemSchema>;

export const BillingSummarySchema = z.array(BillingSummaryItemSchema);
export type BillingSummary = z.infer<typeof BillingSummarySchema>;

// Push Notification Schemas
export const SendPushNotificationOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  successCount: z.number().optional(),
  failureCount: z.number().optional(),
});
export type SendPushNotificationOutput = z.infer<typeof SendPushNotificationOutputSchema>;

export const SendPushNotificationInputSchema = z.object({
  userId: z.string().describe("The UID of the target user."),
  collectionName: z.enum(['vendors', 'customers', 'admins']).describe("The Firestore collection where the user's profile is stored."),
  title: z.string().describe("The title of the notification."),
  body: z.string().describe("The main content of the notification."),
  link: z.string().url().describe("The URL to open when the notification is clicked."),
});
export type SendPushNotificationInput = z.infer<typeof SendPushNotificationInputSchema>;


// Collection Summary Schemas
export const MonthlyCollectionStatsSchema = z.object({
  period: z.string(),
  toCollect: z.number(),
  collected: z.number(),
});

export const CollectionSummarySchema = z.object({
  previousMonth: MonthlyCollectionStatsSchema,
  currentMonth: MonthlyCollectionStatsSchema,
  nextMonth: MonthlyCollectionStatsSchema,
});
export type CollectionSummary = z.infer<typeof CollectionSummarySchema>;
