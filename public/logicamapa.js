console.log("✅ logicamapa.js cargado");


// 🕒 RELOJ
function updateTime() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  minutes = minutes < 10 ? "0" + minutes : minutes;

  document.getElementById("time").textContent = `${hours}:${minutes}`;
  document.getElementById("period").textContent = period;

  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const dayOfWeek = days[now.getDay()];
  const day = now.getDate();
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sept", "Oct", "Nov", "Dic"];
  const month = months[now.getMonth()];

  document.getElementById("day").textContent = `${dayOfWeek}, ${month} ${day}`;
}
updateTime();
setInterval(updateTime, 1000); // Cada segundo

// 🗺️ MAPA
const map = L.map('map').setView([10.4170, -75.5450], 12.5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let currentMarker = null;

map.on('click', function (e) {
  const { lat, lng } = e.latlng;

  if (currentMarker) {
    map.removeLayer(currentMarker);
  }

  currentMarker = L.marker([lat, lng]).addTo(map);
  document.getElementById('formulario-evento').style.display = 'block';
  document.querySelector('input[name="latitud"]').value = lat;
  document.querySelector('input[name="longitud"]').value = lng;
});

// 📋 AGREGAR EVENTO A LISTA
function agregarEventoALista(evento) {
  const lista = document.getElementById("listaEventos");
  if (!lista) return; // ⛔ Si no existe, salimos

  const fecha = new Date(evento.fecha);
  const fechaFormateada = fecha.toLocaleDateString("es-AR");
  const horaFormateada = evento.hora.slice(0, 5);
  const estado = evento.estado || 'No definido';

  const li = document.createElement("li");
  li.innerHTML = `
    <strong>Fecha:</strong> ${fechaFormateada}<br>
    <strong>Hora:</strong> ${horaFormateada}<br>
    <strong>Descripción:</strong> ${evento.descripcion}<br>
    <strong>Estado:</strong> ${estado}
  `;
  lista.appendChild(li);
}


// 📦 CARGAR EVENTOS DESDE EL SERVIDOR
async function cargarEventosGuardados() {
  try {
    const res = await fetch('/eventos');
    const eventos = await res.json();

    eventos.forEach(evento => {
      const marker = L.marker([evento.latitud, evento.longitud]).addTo(map);
      const fechaFormateada = new Date(evento.fecha).toLocaleDateString("es-CO", {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      const horaFormateada = evento.hora.slice(0, 5);
      
      marker.bindPopup(`
        <strong>${fechaFormateada} ${horaFormateada}</strong><br>
        ${evento.descripcion}
      `);      
      agregarEventoALista(evento);
    });
  } catch (error) {
    console.error('Error al cargar eventos:', error);
  }
}
cargarEventosGuardados();

// 📤 GUARDAR EVENTO NUEVO

document.getElementById('eventoForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  try {
    const res = await fetch('/evento', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const message = await res.text();

    if (res.ok) {
      alert('✅ Evento guardado exitosamente');

      // Agregar marcador al mapa
        const fechaFormateada = new Date(data.fecha).toLocaleDateString("es-CO", {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        const horaFormateada = data.hora.slice(0, 5);
        
        L.marker([data.latitud, data.longitud])
          .addTo(map)
          .bindPopup(`<strong>${fechaFormateada} ${horaFormateada}</strong><br>${data.descripcion}`)
          .openPopup();

      // Agregar evento a la lista
      agregarEventoALista(data);

      // Limpiar y ocultar formulario
      e.target.reset();
      document.getElementById('formulario-evento').style.display = 'none';
    } else {
      alert('⚠️ Error al guardar el evento: ' + message);
    }
  } catch (error) {
    console.error('Error en fetch:', error);
    alert('❌ Error inesperado al conectar con el servidor');
  }
});