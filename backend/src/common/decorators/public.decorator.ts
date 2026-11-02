import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';

/** Marca un endpoint como accesible sin JWT (login, pre-registro por token, salud). */
export const Public = () => SetMetadata(ES_PUBLICO, true);
