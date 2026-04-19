'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Users, Search, MoreVertical, Edit, CreditCard, DollarSign, KeyRound, FileText } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getVendors } from '@/ai/flows/get-vendors-flow';
import { Vendor } from '@/lib/data';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

export default function AdminVendorsPage() {
    const { toast } = useToast();
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchVendors = async () => {
            setIsLoading(true);
            try {
                const vendorList = await getVendors();
                setVendors(vendorList);
            } catch (error: any) {
                console.error("Error fetching vendors:", error);
                toast({
                    variant: 'destructive',
                    title: 'Error al cargar comercios',
                    description: 'No se pudo obtener la lista de comercios.',
                });
            } finally {
                setIsLoading(false);
            }
        };
        fetchVendors();
    }, [toast]);

    const filteredVendors = vendors.filter(vendor => 
        vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusVariant = (status?: Vendor['status']) => {
        switch (status) {
            case 'Activo':
                return 'bg-green-100 text-green-800';
            case 'Inactivo':
                return 'bg-yellow-100 text-yellow-800';
            case 'Suspendido':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };
    
    const formatDate = (dateString: any) => {
        if (!dateString) return <span className="text-muted-foreground">N/A</span>;
        try {
            // The date comes as an ISO string from the flow.
            // parseISO is the most reliable way to handle ISO strings.
            const date = parseISO(dateString);
            return format(date, 'dd/MM/yyyy');
        } catch (error) {
            // Fallback for any unexpected format.
            try {
                const date = new Date(dateString);
                 if (isNaN(date.getTime())) throw new Error("Invalid date");
                return format(date, 'dd/MM/yyyy');
            } catch (e) {
                 return <span className="text-muted-foreground">Fecha Inválida</span>;
            }
        }
    };


    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle>Gestión de Comercios</CardTitle>
                        <CardDescription>
                            Aquí puedes ver y gestionar todos los comercios suscritos a HistoPago.
                        </CardDescription>
                    </div>
                    <div className="relative mt-4 md:mt-0 w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nombre o correo..."
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex h-64 w-full flex-col items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="mt-4 text-muted-foreground">Cargando comercios...</p>
                        </div>
                    ) : filteredVendors.length > 0 ? (
                        <div className="border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre del Comercio</TableHead>
                                        <TableHead>Correo Electrónico</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Vencimiento Suscripción</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredVendors.map((vendor) => (
                                        <TableRow key={vendor.id}>
                                            <TableCell className="font-medium">{vendor.name}</TableCell>
                                            <TableCell>{vendor.email}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("border-transparent", getStatusVariant(vendor.status))}>
                                                    {vendor.status || 'Inactivo'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {formatDate(vendor.subscriptionEndDate)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreVertical className="h-4 w-4" />
                                                            <span className="sr-only">Abrir menú</span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/admin/vendors/${vendor.id}/edit`}>
                                                                <Edit className="mr-2 h-4 w-4" />
                                                                Editar Perfil
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/admin/vendors/${vendor.id}/edit#api-key`}>
                                                                <KeyRound className="mr-2 h-4 w-4" />
                                                                Gestionar API Key
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/admin/vendors/${vendor.id}/subscription`}>
                                                                <CreditCard className="mr-2 h-4 w-4" />
                                                                Gestionar Suscripción
                                                            </Link>
                                                        </DropdownMenuItem>
                                                         <DropdownMenuItem asChild>
                                                            <Link href={`/admin/vendors/${vendor.id}/payments`}>
                                                                <DollarSign className="mr-2 h-4 w-4" />
                                                                Pagos de Suscripción
                                                            </Link>
                                                        </DropdownMenuItem>
                                                         <DropdownMenuItem asChild>
                                                            <Link href={`/admin/vendors/${vendor.id}/invoices`}>
                                                                <FileText className="mr-2 h-4 w-4" />
                                                                Historial de Facturación
                                                            </Link>
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                         <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                            <p className="mt-4 text-lg font-medium">No se encontraron comercios</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {searchTerm ? 'Prueba con otro término de búsqueda.' : 'No hay comercios registrados aún.'}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
