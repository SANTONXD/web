const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: '1234',
  resave: false,
  saveUninitialized: true,
}));

// Servir archivos estáticos desde carpeta "public"
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'arqui'
});
const promisePool = pool.promise();

// REGISTRO DE CLIENTE
app.post('/register-cliente', async (req, res) => {
  const { name, user, email, password } = req.body;
  try {
    const [existing] = await promisePool.query(
      'SELECT * FROM Cliente WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      return res.status(400).send('El correo ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await promisePool.query(
      'INSERT INTO Cliente (nombre, apellido, email, password) VALUES (?, ?, ?, ?)',
      [name, user, email, hashedPassword]
    );

    res.redirect('/index.html');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error en el registro del cliente');
  }
});

// REGISTRO DE EMPLEADO
app.post('/register-empleado', async (req, res) => {
  const { name, user, email, rol, password } = req.body;
  try {
    const [existing] = await promisePool.query(
      'SELECT * FROM Empleado WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      return res.status(400).send('El correo ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Obtener el ID del rol
    const [rolData] = await promisePool.query(
      'SELECT id_rol FROM Roles WHERE rol = ?',
      [rol.toLowerCase()]
    );
    if (rolData.length === 0) {
      return res.status(400).send('Rol inválido');
    }
    const idRol = rolData[0].id_rol;

    await promisePool.query(
      'INSERT INTO Empleado (nombre, apellido, email, password, id_rol) VALUES (?, ?, ?, ?, ?)',
      [name, user, email, hashedPassword, idRol]
    );

    res.redirect('/index.html');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error en el registro del empleado');
  }
});

// RUTA LOGIN

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Buscar primero en Empleado
    let [rows] = await promisePool.query(
      'SELECT e.id_empleado AS id, e.password, r.rol FROM Empleado e JOIN Roles r ON e.id_rol = r.id_rol WHERE e.email = ?',
      [email]
    );

    if (rows.length > 0) {
      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).send('Contraseña incorrecta');
      req.session.userId = user.id;
      req.session.rol = user.rol;
      if (user.rol === 'admin') return res.redirect('/principal-admin.html');
      else return res.redirect('/principal-funcionario.html');
    }

    // Si no es empleado, buscar en Cliente
    [rows] = await promisePool.query(
      'SELECT id_cliente AS id, password FROM Cliente WHERE email = ?',
      [email]
    );
    if (rows.length === 0) return res.status(401).send('Usuario no encontrado');

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).send('Contraseña incorrecta');

    req.session.userId = user.id;
    req.session.rol = 'cliente';
    return res.redirect('/principal-cliente.html');

  } catch (error) {
    console.error(error);
    res.status(500).send('Error en el login');
  }
});

// Guardar evento
// Guardar evento y crear su estado inicial
app.post('/evento', async (req, res) => {
  const { latitud, longitud, fecha, hora, descripcion } = req.body;
  const userId = req.session.userId;

  if (!userId) return res.status(401).send('No has iniciado sesión');

  const conn = await promisePool.getConnection();
  await conn.beginTransaction();

  try {
    // 1. Insertar evento y obtener ID generado
    const [result] = await conn.query(
      'INSERT INTO Eventos (latitud, longitud, fecha, hora, descripcion, creado_por) VALUES (?, ?, ?, ?, ?, ?)',
      [latitud, longitud, fecha, hora, descripcion, userId]
    );
    const idEvento = result.insertId;

    // 2. Insertar en Estado_Eventos con estado 'Iniciado'
    await conn.query(
      'INSERT INTO Estado_Eventos (id_evento, estado) VALUES (?, ?)',
      [idEvento, 'Iniciado']
    );

    // Obtener el ID del estado recién insertado
const [estadoRow] = await conn.query(
  'SELECT id_estado FROM Estado_Eventos WHERE id_evento = ?',
  [idEvento]
);
const idEstado = estadoRow[0].id_estado;

// Actualizar el evento con el ID del estado
await conn.query(
  'UPDATE Eventos SET id_estado = ? WHERE id_evento = ?',
  [idEstado, idEvento]
);


    await conn.commit();
    res.status(200).send('Evento y estado guardados');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).send('Error al guardar el evento y su estado');
  } finally {
    conn.release();
  }
});

// Obtener eventos
app.get('/eventos', async (req, res) => {
  try {
    const [rows] = await promisePool.query(`
      SELECT 
        e.id_evento,
        e.latitud,
        e.longitud,
        e.fecha,
        e.hora,
        e.descripcion,
        s.estado
      FROM Eventos e
      LEFT JOIN Estado_Eventos s ON e.id_estado = s.id_estado
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener eventos');
  }
});


// Participar en un evento
app.post('/participar', async (req, res) => {
  const userId = req.session.userId;
  const rol = req.session.rol;
  const { id_evento } = req.body;

  if (!userId || rol !== 'cliente') {
    return res.status(401).send('Debes iniciar sesión como cliente');
  }

  try {
    // Verificar si ya está registrado
    const [existente] = await promisePool.query(
      'SELECT * FROM Participacion_Evento WHERE id_cliente = ? AND id_evento = ?',
      [userId, id_evento]
    );
    if (existente.length > 0) {
      return res.status(400).send('Ya estás inscrito en este evento');
    }

    const fecha = new Date().toISOString().split('T')[0]; // fecha actual YYYY-MM-DD

    await promisePool.query(
      'INSERT INTO Participacion_Evento (id_cliente, id_evento, fecha_participacion) VALUES (?, ?, ?)',
      [userId, id_evento, fecha]
    );

    res.send('Participación registrada correctamente');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al registrar la participación');
  }
});

// Obtener todas las participaciones con datos de usuario y evento
app.get('/participaciones', async (req, res) => {
  try {
    const [rows] = await promisePool.query(`
  SELECT 
    p.id_participacion,
    c.nombre AS nombre_cliente,
    e.descripcion AS evento,
    p.fecha_participacion,
    e.hora,
    p.puntos_otorgados,
    s.estado
  FROM Participacion_Evento p
  JOIN Cliente c ON p.id_cliente = c.id_cliente
  JOIN Eventos e ON p.id_evento = e.id_evento
  LEFT JOIN Estado_Eventos s ON e.id_estado = s.id_estado
`);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al obtener las participaciones');
  }
});

app.post('/asignar-puntos', async (req, res) => {
  const { id_participacion, puntos } = req.body;
  const rol = req.session.rol;

  if (rol !== 'admin' && rol !== 'funcionario') {
    return res.status(403).send('No autorizado');
  }

  try {
    await promisePool.query(
      'UPDATE Participacion_Evento SET puntos_otorgados = ? WHERE id_participacion = ?',
      [puntos, id_participacion]
    );
    res.send('Puntos actualizados correctamente');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al asignar puntos');
  }
});

// Participaciones del cliente logueado
app.get('/mis-participaciones', async (req, res) => {
  const userId = req.session.userId;
  const rol = req.session.rol;

  if (!userId || rol !== 'cliente') {
    return res.status(401).send('No autorizado');
  }

  try {
    const [rows] = await promisePool.query(`
      SELECT 
        p.id_participacion,
        e.descripcion AS evento,
        p.fecha_participacion,
        e.hora,
        p.puntos_otorgados,
        s.estado
      FROM Participacion_Evento p
      JOIN Eventos e ON p.id_evento = e.id_evento
      LEFT JOIN Estado_Eventos s ON e.id_estado = s.id_estado
      WHERE p.id_cliente = ?
    `, [userId]);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al obtener mis participaciones');
  }
});


//PUNTOS TOTALES CLIENTE
app.get('/puntos-totales', async (req, res) => {
  const userId = req.session.userId;

  if (!userId) return res.status(401).send('No has iniciado sesión');

  try {
    const [rows] = await promisePool.query(
      'SELECT SUM(puntos_otorgados) AS total_puntos FROM Participacion_Evento WHERE id_cliente = ?',
      [userId]
    );
    const total = rows[0].total_puntos || 0;
    res.json({ total });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al obtener los puntos totales');
  }
});

//EVENTOS EN LOS QUE YA PARTICIPO

app.get('/eventos-cliente', async (req, res) => {
  const userId = req.session.userId;
  const rol = req.session.rol;

  if (!userId || rol !== 'cliente') {
    return res.status(401).send('No autorizado');
  }

  try {
    const [rows] = await promisePool.query(`
      SELECT 
        e.id_evento,
        e.descripcion,
        e.fecha,
        e.hora,
        e.latitud,
        e.longitud,
        s.estado,
        (SELECT COUNT(*) FROM Participacion_Evento p WHERE p.id_evento = e.id_evento AND p.id_cliente = ?) AS ya_participo
      FROM Eventos e
      LEFT JOIN Estado_Eventos s ON e.id_estado = s.id_estado
    `, [userId]);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al obtener eventos para cliente');
  }
});

// --- CRUD DE EVENTOS (ADMINISTRADOR) ---

// Obtener un evento por ID
app.get('/admin/eventos/:id', async (req, res) => {
  const { id } = req.params;
  try {
      const [rows] = await promisePool.query('SELECT * FROM Eventos WHERE id_evento = ?', [id]);
      if (rows.length === 0) {
          return res.status(404).send('Evento no encontrado');
      }
      res.json(rows[0]);
  } catch (error) {
      console.error('Error al obtener el evento', error);
      res.status(500).send('Error al obtener el evento');
  }
});

// Modificar evento
app.put('/admin/eventos/:id', async (req, res) => {
  const { id } = req.params;
  const { latitud, longitud, fecha, hora, descripcion, estado } = req.body;

  const conn = await promisePool.getConnection();
  await conn.beginTransaction();

  try {
    // 1. Actualiza la tabla de eventos
    const [eventoUpdate] = await conn.query(
      'UPDATE Eventos SET latitud = ?, longitud = ?, fecha = ?, hora = ?, descripcion = ? WHERE id_evento = ?',
      [latitud, longitud, fecha, hora, descripcion, id]
    );

    if (eventoUpdate.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).send('Evento no encontrado');
    }

    // 2. Inserta o actualiza estado en Estado_Eventos
    await conn.query(`
      INSERT INTO Estado_Eventos (id_evento, estado)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE estado = VALUES(estado)
    `, [id, estado || 'Iniciado']);

    await conn.commit();
    res.send('Evento y estado actualizados correctamente');
  } catch (error) {
    await conn.rollback();
    console.error('Error al actualizar el evento', error);
    res.status(500).send('Error al actualizar el evento y su estado');
  } finally {
    conn.release();
  }
});

// Eliminar evento
app.delete('/admin/eventos/:id', async (req, res) => {
  const { id } = req.params;
  try {
      const [result] = await promisePool.query('DELETE FROM Eventos WHERE id_evento = ?', [id]);
      if (result.affectedRows === 0) {
          return res.status(404).send('Evento no encontrado');
      }
      res.send('Evento eliminado correctamente');
  } catch (error) {
      console.error('Error al eliminar el evento', error);
      res.status(500).send('Error al eliminar el evento');
  }
});

// RUTA PARA CANJEAR PUNTOS POR AGUA
app.post('/canjear-puntos', async (req, res) => {
    const userId = req.session.userId;
    const rol = req.session.rol;
    const { puntosACanjear } = req.body;

    if (!userId || rol !== 'cliente') return res.status(401).send('No autorizado');

    const puntosNecesariosPorLitro = 20; // 100 puntos / 5 litros
    const litrosObtenidos = parseInt(puntosACanjear, 10) / puntosNecesariosPorLitro;

    if (isNaN(litrosObtenidos) || litrosObtenidos < 0) {
        return res.status(400).send('Cantidad de puntos a canjear inválida.');
    }

    const puntosRequeridos = parseInt(puntosACanjear, 10);
    if (puntosRequeridos % 100 !== 0 || puntosRequeridos < 100) {
        return res.status(400).send('Solo puedes canjear múltiplos de 100 puntos.');
    }

    try {
        // Obtener los puntos actuales del cliente
        const [puntosActualesResult] = await promisePool.query(
            'SELECT SUM(puntos_otorgados) AS total_puntos FROM Participacion_Evento WHERE id_cliente = ?',
            [userId]
        );
        const puntosActuales = puntosActualesResult[0].total_puntos || 0;

        if (puntosActuales < puntosRequeridos) {
            return res.status(400).send('No tienes suficientes puntos para realizar el canje.');
        }

        // Iniciar transacción para asegurar la integridad de los datos
        const conn = await promisePool.getConnection();
        await conn.beginTransaction();

        try {
            // Restar los puntos canjeados
            await conn.query(
                `UPDATE Participacion_Evento
                 SET puntos_otorgados = puntos_otorgados - ?
                 WHERE id_cliente = ? AND puntos_otorgados > 0
                 ORDER BY id_participacion
                 LIMIT 9999999999999;`, // Un límite alto para asegurar que se descuenten los puntos necesarios
                [puntosRequeridos, userId]
            );

            // Actualizar los litros de agua del cliente
            await conn.query(
                'UPDATE Cliente SET litros_canjeados = COALESCE(litros_canjeados, 0) + ? WHERE id_cliente = ?',
                [litrosObtenidos, userId]
            );

await conn.query(
  'INSERT INTO Canje_Puntos (id_cliente, puntos_canjeados, litros_agua_donados, fecha_canje) VALUES (?, ?, ?, CURDATE())',
  [userId, puntosRequeridos, litrosObtenidos]
);


            await conn.commit();
            res.status(200).send(`Canje exitoso. Obtuviste ${litrosObtenidos} litros de agua.`);

        } catch (error) {
            await conn.rollback();
            console.error('Error al canjear puntos:', error);
            res.status(500).send('Error al realizar el canje de puntos.');
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error(error);
        res.status(500).send('Error al procesar la solicitud de canje.');
    }
});

app.get('/cliente/datos', async (req, res) => {
  const userId = req.session.userId;
  const rol = req.session.rol;

  if (!userId || rol !== 'cliente') {
    return res.status(401).send('No autorizado');
  }

  try {
    // Obtener puntos totales
    const [puntos] = await promisePool.query(`
      SELECT SUM(puntos_otorgados) AS totalPuntos
      FROM Participacion_Evento
      WHERE id_cliente = ?
    `, [userId]);

    // Obtener litros canjeados
    const [cliente] = await promisePool.query(`
      SELECT litros_canjeados
      FROM Cliente
      WHERE id_cliente = ?
    `, [userId]);

    res.json({
      totalPuntos: puntos[0].totalPuntos || 0,
      totalLitrosCanjeados: cliente[0].litros_canjeados || 0
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Error al obtener datos del cliente');
  }
});


// Servidor
app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});

