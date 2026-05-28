/* =============================================================================
   FICHERO: backend/src/middleware/adminAuth.ts
   ¿QUÉ ES ESTO?
   Un "guardia de seguridad" para las rutas del servidor que solo puede usar
   el administrador. Antes de que una petición llegue a su destino (crear,
   editar o borrar un canal), pasa por aquí para verificar que lleva el
   token correcto.

   Analogía: es como la tarjeta de acceso a una zona restringida. Cuando
   alguien intenta entrar a la sala del servidor, el guardia (este middleware)
   comprueba si la tarjeta es válida. Si lo es, le deja pasar. Si no, le para.

   ¿Qué es un middleware de Express?
   Es una función intermedia que se ejecuta entre que llega la petición HTTP
   y que el servidor la procesa. Se puede añadir como filtro en rutas concretas.
   Estructura: recibe (petición, respuesta, siguiente) y decide si dejar pasar.
============================================================================= */

import type { Request, Response, NextFunction } from 'express'

/*
 * Función que verifica si la petición viene de un administrador.
 *
 * El cliente debe enviar el token en la cabecera HTTP de esta forma:
 *   Authorization: Bearer mi_token_secreto
 *
 * El token se compara con ADMIN_TOKEN (variable de entorno).
 * Si coincide → se deja pasar la petición (next()).
 * Si no coincide o no existe → se responde con error 401 (No autorizado).
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  // Extraemos el token de la cabecera Authorization.
  // El formato es "Bearer TOKEN", por eso quitamos el prefijo "Bearer "
  const token = req.headers['authorization']?.replace('Bearer ', '')

  // Comprobar que el token existe Y que es igual al secreto del servidor
  if (!token || token !== process.env['ADMIN_TOKEN']) {
    // 401 = "No autorizado" — el estándar HTTP para credenciales incorrectas
    res.status(401).json({ error: 'No autorizado' })
    return  // Parar aquí — no llamar a next(), la petición no continúa
  }

  // Todo correcto — dejar pasar la petición a la siguiente función
  next()
}
