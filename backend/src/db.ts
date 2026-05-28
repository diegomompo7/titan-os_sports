/* =============================================================================
   FICHERO: backend/src/db.ts
   ¿QUÉ ES ESTO?
   Este fichero gestiona la conexión con la base de datos MySQL.
   La base de datos es donde se guardan permanentemente todos los datos:
   canales, eventos, configuración, etc. Sin esto, cada vez que se
   reiniciara el servidor se perderían todos los datos.

   Analogía: imagina que la app es un restaurante. La base de datos es
   el almacén donde se guardan los ingredientes. Este fichero es la puerta
   de ese almacén — define cuántos cocineros (conexiones) pueden entrar
   a la vez y con qué llave (URL de acceso).

   ¿Qué es un "pool de conexiones"?
   En vez de abrir y cerrar la puerta cada vez que se necesita algo, se dejan
   varias puertas abiertas permanentemente. Así las peticiones son más rápidas.
   Aquí usamos un máximo de 10 puertas (connectionLimit: 10) abiertas a la vez.
============================================================================= */

// mysql2/promise es la librería que nos permite hablar con MySQL en JavaScript
// La versión /promise permite usar async/await (esperar respuestas sin bloquear)
import mysql from 'mysql2/promise'

// dotenv/config carga las variables de entorno desde el fichero .env
// Las variables de entorno son configuraciones secretas (como contraseñas)
// que no se guardan en el código sino en un fichero aparte no publicado
import 'dotenv/config'

// Creamos el "pool" (grupo de conexiones) a la base de datos
const pool = mysql.createPool({
  // La URL de conexión incluye usuario, contraseña, servidor y nombre de BD.
  // Se lee de la variable de entorno DATABASE_URL para no dejar la contraseña
  // escrita directamente en el código (mala práctica de seguridad)
  uri: process.env['DATABASE_URL'],

  // ssl: acepta certificados aunque no sean de una autoridad reconocida.
  // Necesario para conectarse a bases de datos en la nube (como Railway)
  ssl: { rejectUnauthorized: false },

  // Si todas las conexiones están ocupadas, la siguiente petición espera
  // en vez de fallar con un error. Como hacer cola en una caja del súper.
  waitForConnections: true,

  // Máximo 10 conexiones simultáneas abiertas con la base de datos
  connectionLimit: 10,
})

// Exportamos el pool para que cualquier parte del backend pueda usarlo
// para ejecutar consultas SQL
export default pool
