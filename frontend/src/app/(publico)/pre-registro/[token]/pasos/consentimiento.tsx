'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Boton } from '@/components/ui/boton';
import { Casilla } from '@/components/ui/casilla';
import { Modal } from '@/components/ui/modal';
import { Pasos } from '@/components/ui/pasos';
import { Tarjeta } from '@/components/ui/tarjeta';
import { ApiError } from '@/lib/api';
import { preRegistroApi, type EstadoPreRegistro } from '@/services/pre-registro';
import { PASOS } from './datos';

interface Props {
  token: string;
  estado: EstadoPreRegistro;
  onAtras: () => void;
  onListo: (estado: EstadoPreRegistro) => void;
}

/** V3a / V3b · Paso 2 Consentimiento y NDA (HU-04). El botón se habilita solo con ambas casillas. */
export function PasoConsentimiento({ token, estado, onAtras, onListo }: Props) {
  const [tratamiento, setTratamiento] = useState(false);
  const [nda, setNda] = useState(false);
  // HU-04: casilla independiente y nunca premarcada
  const [biometria, setBiometria] = useState(false);
  const [modal, setModal] = useState<'politica' | 'nda' | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const aceptar = useMutation({
    mutationFn: () => preRegistroApi.consentimiento(token, biometria),
    onSuccess: onListo,
    onError: (e) => setErrorGeneral(e instanceof ApiError ? e.message : 'No fue posible registrar su aceptación'),
  });

  const listo = tratamiento && nda;

  return (
    <div className="space-y-6">
      <Pasos pasos={PASOS} actual={1} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Consentimiento y confidencialidad</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Política de tratamiento de datos versión {estado.politicaVersion}.</p>
      </div>
      {errorGeneral ? <Alerta tipo="error">{errorGeneral}</Alerta> : null}

      <Tarjeta titulo="Resumen">
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Sus datos (nombre, documento, empresa, correo y teléfono) se usan únicamente para gestionar su ingreso y garantizar la seguridad de la planta.</li>
          <li>Se conservan cifrados durante el período de retención definido y luego se anonimizan (Ley 1581 de 2012).</li>
          <li>Puede solicitar la consulta, corrección o eliminación de sus datos al Delegado de Protección de Datos.</li>
          <li>La información a la que acceda durante la visita (procesos, maquinaria, materias primas) es confidencial.</li>
        </ul>
        <div className="mt-4 flex gap-4 text-sm">
          <button type="button" onClick={() => setModal('politica')} className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            Leer la política completa
          </button>
          <button type="button" onClick={() => setModal('nda')} className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            Leer el acuerdo de confidencialidad
          </button>
        </div>
      </Tarjeta>

      <div className="space-y-5">
        <Casilla
          etiqueta="Acepto el tratamiento de mis datos personales"
          descripcion="Autorizo a la planta a tratar mis datos según la política de protección de datos."
          checked={tratamiento}
          onChange={(e) => setTratamiento(e.target.checked)}
        />
        <Casilla
          etiqueta="Acepto el acuerdo de confidencialidad (NDA)"
          descripcion="Me comprometo a no divulgar información de procesos, productos o instalaciones."
          checked={nda}
          onChange={(e) => setNda(e.target.checked)}
        />
      </div>

      <Tarjeta titulo="Identificación con huella (opcional)">
        <Casilla
          etiqueta="Autorizo el tratamiento de mi huella dactilar"
          descripcion="La huella es un dato sensible y usted no está obligado a entregarla. Si no la autoriza, ingresará con un código QR y su documento, con las mismas condiciones. Solo se guarda una plantilla cifrada, nunca la imagen, y se elimina a los 12 meses sin visitas o cuando revoque esta autorización."
          checked={biometria}
          onChange={(e) => setBiometria(e.target.checked)}
        />
      </Tarjeta>

      {!listo ? <p className="text-sm text-gray-500 dark:text-gray-400">Marque las dos casillas obligatorias para continuar.</p> : null}

      <div className="flex flex-col gap-3">
        <Boton bloque tamano="xl" disabled={!listo} cargando={aceptar.isPending} onClick={() => aceptar.mutate()}>
          Acepto y continúo
        </Boton>
        <Boton bloque variante="secundario" onClick={onAtras}>
          Volver a mis datos
        </Boton>
      </div>

      <Modal
        abierto={modal === 'politica'}
        onCerrar={() => setModal(null)}
        titulo="Política de tratamiento de datos personales"
        ancho="lg"
        acciones={
          <Boton variante="secundario" onClick={() => setModal(null)}>
            Cerrar
          </Boton>
        }
      >
        <div className="max-h-[50vh] space-y-3 overflow-y-auto text-sm text-gray-700 dark:text-gray-300">
          <p>
            <strong>Responsable del tratamiento:</strong> la planta de producción de materias primas textiles ubicada en Bogotá, a través de su
            Delegado de Protección de Datos.
          </p>
          <p>
            <strong>Finalidad:</strong> registrar y controlar el ingreso, permanencia y salida de visitantes; verificar la identidad frente a listas de
            restricción; notificar al anfitrión; cumplir obligaciones de seguridad industrial y responder ante auditorías o emergencias.
          </p>
          <p>
            <strong>Datos tratados:</strong> nombre, tipo y número de documento, empresa, correo electrónico, teléfono, horas de ingreso y salida y
            resultado de la inducción de seguridad. Solo si usted lo autoriza, también la plantilla de su huella dactilar, que es un dato sensible.
          </p>
          <p>
            <strong>Conservación:</strong> los datos se almacenan cifrados y se anonimizan al vencer el período de retención definido por la planta.
          </p>
          <p>
            <strong>Derechos del titular:</strong> conocer, actualizar, rectificar y solicitar la supresión de sus datos, así como revocar la
            autorización, mediante solicitud escrita al Delegado de Protección de Datos, que se atiende en un plazo máximo de 15 días hábiles.
          </p>
          <p>Marco legal: Ley 1581 de 2012 y Decreto 1377 de 2013 de la República de Colombia.</p>
        </div>
      </Modal>

      <Modal
        abierto={modal === 'nda'}
        onCerrar={() => setModal(null)}
        titulo="Acuerdo de confidencialidad"
        ancho="lg"
        acciones={
          <Boton variante="secundario" onClick={() => setModal(null)}>
            Cerrar
          </Boton>
        }
      >
        <div className="max-h-[50vh] space-y-3 overflow-y-auto text-sm text-gray-700 dark:text-gray-300">
          <p>
            El visitante reconoce que durante su permanencia podrá tener acceso a información confidencial de la planta: procesos productivos,
            fórmulas y mezclas de fibras, proveedores, maquinaria, volúmenes de producción y cualquier dato no público.
          </p>
          <p>
            Se compromete a no divulgar, copiar, fotografiar ni utilizar dicha información para fines distintos del motivo de la visita, durante la
            visita y después de ella.
          </p>
          <p>La toma de fotografías o videos dentro de las áreas de producción requiere autorización expresa del anfitrión.</p>
        </div>
      </Modal>
    </div>
  );
}
