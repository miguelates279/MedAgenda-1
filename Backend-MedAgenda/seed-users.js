/**
 * Cross-platform Node.js script to mass-create administrative users (doctors/owners)
 * against the MedAgenda backend deployed on Vercel (connected to Aiven MySQL).
 * 
 * Run with: node seed-users.js
 */

const API_URL = 'https://med-agenda-1-three.vercel.app/users/register';

const users = [
  {
    first_name: "Carlos",
    second_name: "Andrés",
    first_last_name: "Martínez",
    second_last_name: "Gómez",
    legal_id: "1035678901",
    password: "12345678",
    user_phone_number: "+573001234567",
    user_email_address: "carlos.martinez@cardiosalud.com",
    birth_date: "1975-03-15",
    gender: "M",
    address: "Calle 10 #43-12, El Poblado",
    city: "Medellín",
    state: "Antioquia",
    country: "Colombia"
  },
  {
    first_name: "María",
    second_name: "Fernanda",
    first_last_name: "López",
    second_last_name: "Rodríguez",
    legal_id: "1025789012",
    password: "12345678",
    user_phone_number: "+573109876543",
    user_email_address: "maria.lopez@neurocentro.com",
    birth_date: "1978-08-22",
    gender: "F",
    address: "Carrera 15 #93-40, Chicó",
    city: "Bogotá",
    state: "Cundinamarca",
    country: "Colombia"
  },
  {
    first_name: "Ana",
    second_name: "Lucía",
    first_last_name: "Torres",
    second_last_name: "Ramírez",
    legal_id: "1045890123",
    password: "12345678",
    user_phone_number: "+573201122334",
    user_email_address: "ana.torres@pediatricoarcoiris.com",
    birth_date: "1982-11-10",
    gender: "F",
    address: "Avenida 6N #23-45, Granada",
    city: "Cali",
    state: "Valle del Cauca",
    country: "Colombia"
  },
  {
    first_name: "Sofía",
    second_name: "Patricia",
    first_last_name: "Herrera",
    second_last_name: "Castillo",
    legal_id: "1055901234",
    password: "12345678",
    user_phone_number: "+573155544332",
    user_email_address: "sofia.herrera@mujervital.com",
    birth_date: "1980-05-18",
    gender: "F",
    address: "Calle 98 #52-165, Riomar",
    city: "Barranquilla",
    state: "Atlántico",
    country: "Colombia"
  },
  {
    first_name: "Jorge",
    second_name: "Eduardo",
    first_last_name: "Suárez",
    second_last_name: "Mendoza",
    legal_id: "1015678903",
    password: "12345678",
    user_phone_number: "+573187654321",
    user_email_address: "jorge.suarez@dermaclinic.com",
    birth_date: "1983-09-05",
    gender: "M",
    address: "Carrera 27 #50-20, Sotomayor",
    city: "Bucaramanga",
    state: "Santander",
    country: "Colombia"
  },
  {
    first_name: "Ricardo",
    second_name: "Javier",
    first_last_name: "Morales",
    second_last_name: "Pérez",
    legal_id: "1065123456",
    password: "12345678",
    user_phone_number: "+573144455566",
    user_email_address: "ricardo.morales@oncologico.com",
    birth_date: "1972-12-30",
    gender: "M",
    address: "Avenida Pedro de Heredia",
    city: "Cartagena",
    state: "Bolívar",
    country: "Colombia"
  },
  {
    first_name: "Laura",
    second_name: "Cristina",
    first_last_name: "Vargas",
    second_last_name: "Sánchez",
    legal_id: "1075234567",
    password: "12345678",
    user_phone_number: "+573122233344",
    user_email_address: "laura.vargas@equilibriomental.com",
    birth_date: "1984-04-12",
    gender: "F",
    address: "Calle 65 #23-45, Milán",
    city: "Manizales",
    state: "Caldas",
    country: "Colombia"
  },
  {
    first_name: "Fernando",
    second_name: "Alejandro",
    first_last_name: "Ruiz",
    second_last_name: "García",
    legal_id: "1085345678",
    password: "12345678",
    user_phone_number: "+573166677788",
    user_email_address: "fernando.ruiz@visionclara.com",
    birth_date: "1979-07-25",
    gender: "M",
    address: "Avenida 0 #11-56, Centro",
    city: "Cúcuta",
    state: "Norte de Santander",
    country: "Colombia"
  },
  {
    first_name: "Gabriel",
    second_name: "Antonio",
    first_last_name: "Méndez",
    second_last_name: "Fernández",
    legal_id: "V12345678",
    password: "12345678",
    user_phone_number: "+582129998877",
    user_email_address: "gabriel.mendez@saludauditiva.com",
    birth_date: "1981-02-14",
    gender: "M",
    address: "Av. Francisco de Miranda",
    city: "Caracas",
    state: "Distrito Capital",
    country: "Venezuela"
  },
  {
    first_name: "Miguel",
    second_name: "Ángel",
    first_last_name: "Ramos",
    second_last_name: "Contreras",
    legal_id: "V23456789",
    password: "12345678",
    user_phone_number: "+582615554433",
    user_email_address: "miguel.ramos@traumaclinic.com",
    birth_date: "1977-06-08",
    gender: "M",
    address: "Calle 72 con Av. 3E",
    city: "Maracaibo",
    state: "Zulia",
    country: "Venezuela"
  }
];

async function seedUsers() {
  console.log('🚀 Starting mass user registration against Aiven / Vercel...');
  console.log(`Target API: ${API_URL}\n`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    console.log(`[${i + 1}/${users.length}] Registering ${user.first_name} ${user.first_last_name} (${user.user_email_address})...`);
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(user)
      });

      const responseText = await response.text();
      
      if (response.ok) {
        console.log(`   ✅ Success!`);
      } else {
        console.log(`   ⚠️ Failed (${response.status}): ${responseText}`);
      }
    } catch (err) {
      console.error(`   ❌ Network error:`, err.message);
    }
  }

  console.log('\n🎉 Seeding process completed!');
  console.log('Default password for all created users: 12345678');
}

seedUsers();
