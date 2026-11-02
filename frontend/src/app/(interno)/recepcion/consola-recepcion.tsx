'use client';

import { useState } from 'react';
import type { FichaVisitante, ResultadoConfirmar } from '@/services/check-in';
import { FichaVisita } from './ficha-visita';
import { FormularioExpres } from './formulario-expres';
import { ResultadoAutorizado, ResultadoBloqueado, ResultadoContingencia } from './resultados';
import { ZonaEscaneo } from './zona-escaneo';

type Vista =
  | { tipo: 'escaneo' }
  | { tipo: 'expres' }
  | { tipo: 'ficha'; visitaId: string }
  | { tipo: 'autorizado'; ficha: FichaVisitante; selloTiempo: string }
  | { tipo: 'contingencia'; ficha: FichaVisitante; selloTiempo: string; motivo?: string }
  | { tipo: 'bloqueado'; ficha: FichaVisitante };

/** Consola de recepción: R1 → R2 → R3a, R3b o R4, con R5 y R8 (sección 6.5 del plan). */
export function ConsolaRecepcion({ visitaInicial }: { visitaInicial?: string }) {
  const [vista, setVista] = useState<Vista>(visitaInicial ? { tipo: 'ficha', visitaId: visitaInicial } : { tipo: 'escaneo' });
  const reiniciar = () => setVista({ tipo: 'escaneo' });
  const abrirFicha = (visitaId: string) => setVista({ tipo: 'ficha', visitaId });

  const alConfirmar = (r: ResultadoConfirmar) => {
    const selloTiempo = r.selloTiempo ?? new Date().toISOString();
    if (r.resultado === 'AUTORIZADO') setVista({ tipo: 'autorizado', ficha: r.ficha, selloTiempo });
    if (r.resultado === 'CONTINGENCIA') setVista({ tipo: 'contingencia', ficha: r.ficha, selloTiempo, motivo: r.motivo });
    if (r.resultado === 'BLOQUEADO') setVista({ tipo: 'bloqueado', ficha: r.ficha });
  };

  switch (vista.tipo) {
    case 'escaneo':
      return <ZonaEscaneo onFicha={abrirFicha} onExpres={() => setVista({ tipo: 'expres' })} />;
    case 'expres':
      return (
        <FormularioExpres
          onCancelar={reiniciar}
          onCreada={(r) => (r.resultado === 'BLOQUEADO' ? setVista({ tipo: 'bloqueado', ficha: r.ficha }) : abrirFicha(r.ficha.visita.id))}
        />
      );
    case 'ficha':
      return (
        <FichaVisita
          visitaId={vista.visitaId}
          onVolver={reiniciar}
          onResultado={alConfirmar}
          onContingencia={(ficha) => setVista({ tipo: 'contingencia', ficha, selloTiempo: ficha.visita.horaIngreso ?? new Date().toISOString() })}
          onBloqueo={(ficha) => setVista({ tipo: 'bloqueado', ficha })}
        />
      );
    case 'autorizado':
      return <ResultadoAutorizado ficha={vista.ficha} selloTiempo={vista.selloTiempo} onSiguiente={reiniciar} />;
    case 'contingencia':
      return <ResultadoContingencia ficha={vista.ficha} selloTiempo={vista.selloTiempo} motivo={vista.motivo} onSiguiente={reiniciar} />;
    case 'bloqueado':
      return <ResultadoBloqueado ficha={vista.ficha} onCerrar={reiniciar} onExcepcion={abrirFicha} />;
  }
}
