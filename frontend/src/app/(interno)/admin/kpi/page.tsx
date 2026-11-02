import { TableroKpi } from '@/components/dominio/tablero-kpi';

export const metadata = { title: 'Tablero de KPI' };

export default function PaginaTableroJefe() {
  return <TableroKpi esAdministrador={false} />;
}
