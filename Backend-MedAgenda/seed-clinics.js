/**
 * Cross-platform Node.js script to log in the created users (IDs 5 to 14)
 * and mass-create clinics linked to them against the MedAgenda backend on Vercel.
 * 
 * Run with: node seed-clinics.js
 */

const API_BASE = 'https://med-agenda-1-three.vercel.app';

const clinicOwners = [
  {
    email: 'carlos.martinez@cardiosalud.com',
    password: '12345678',
    clinic: {
      clinic_name: 'CardioSalud Medellín',
      clinic_phone_number: '+573001234567',
      clinic_city_id: 1,
      clinic_address: 'Calle 10 #43-12, El Poblado',
      clinic_description: 'Especialistas en cardiología y salud cardiovascular integral.'
    }
  },
  {
    email: 'maria.lopez@neurocentro.com',
    password: '12345678',
    clinic: {
      clinic_name: 'NeuroCentro Bogotá',
      clinic_phone_number: '+573109876543',
      clinic_city_id: 2,
      clinic_address: 'Carrera 15 #93-40, Chicó',
      clinic_description: 'Centro avanzado de neurología y diagnóstico cerebral.'
    }
  },
  {
    email: 'ana.torres@pediatricoarcoiris.com',
    password: '12345678',
    clinic: {
      clinic_name: 'Pediátrico Arcoíris',
      clinic_phone_number: '+573201122334',
      clinic_city_id: 3,
      clinic_address: 'Avenida 6N #23-45, Granada',
      clinic_description: 'Atención médica integral especializada en infantes y adolescentes.'
    }
  },
  {
    email: 'sofia.herrera@mujervital.com',
    password: '12345678',
    clinic: {
      clinic_name: 'Mujer Vital',
      clinic_phone_number: '+573155544332',
      clinic_city_id: 4,
      clinic_address: 'Calle 98 #52-165, Riomar',
      clinic_description: 'Clínica de ginecología, obstetricia y salud de la mujer.'
    }
  },
  {
    email: 'jorge.suarez@dermaclinic.com',
    password: '12345678',
    clinic: {
      clinic_name: 'DermaClinic',
      clinic_phone_number: '+573187654321',
      clinic_city_id: 5,
      clinic_address: 'Carrera 27 #50-20, Sotomayor',
      clinic_description: 'Dermatología clínica, estética y cirugía dermatológica.'
    }
  },
  {
    email: 'ricardo.morales@oncologico.com',
    password: '12345678',
    clinic: {
      clinic_name: 'Instituto Oncológico',
      clinic_phone_number: '+573144455566',
      clinic_city_id: 6,
      clinic_address: 'Avenida Pedro de Heredia',
      clinic_description: 'Tratamiento y prevención oncológica especializada.'
    }
  },
  {
    email: 'laura.vargas@equilibriomental.com',
    password: '12345678',
    clinic: {
      clinic_name: 'Equilibrio Mental',
      clinic_phone_number: '+573122233344',
      clinic_city_id: 7,
      clinic_address: 'Calle 65 #23-45, Milán',
      clinic_description: 'Psiquiatría y bienestar emocional.'
    }
  },
  {
    email: 'fernando.ruiz@visionclara.com',
    password: '12345678',
    clinic: {
      clinic_name: 'VisiónClara',
      clinic_phone_number: '+573166677788',
      clinic_city_id: 8,
      clinic_address: 'Avenida 0 #11-56, Centro',
      clinic_description: 'Oftalmología avanzada y cirugía láser.'
    }
  },
  {
    email: 'gabriel.mendez@saludauditiva.com',
    password: '12345678',
    clinic: {
      clinic_name: 'Salud Auditiva CCS',
      clinic_phone_number: '+582129998877',
      clinic_city_id: 9,
      clinic_address: 'Av. Francisco de Miranda',
      clinic_description: 'Otorrinolaringología y audiología especializada.'
    }
  },
  {
    email: 'miguel.ramos@traumaclinic.com',
    password: '12345678',
    clinic: {
      clinic_name: 'TraumaClinic Zulia',
      clinic_phone_number: '+582615554433',
      clinic_city_id: 10,
      clinic_address: 'Calle 72 con Av. 3E',
      clinic_description: 'Traumatología, ortopedia y rehabilitación.'
    }
  }
];

async function seedClinics() {
  console.log('🏥 Starting clinic seeding against Aiven / Vercel...');
  console.log(`Target API: ${API_BASE}\n`);

  for (let i = 0; i < clinicOwners.length; i++) {
    const item = clinicOwners[i];
    console.log(`[${i + 1}/${clinicOwners.length}] Processing owner ${item.email}...`);

    try {
      // 1. Login to get token
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: item.email, password: item.password })
      });

      const loginData = await loginRes.json();

      if (!loginRes.ok || !loginData.token) {
        console.log(`   ❌ Login failed for ${item.email}:`, loginData);
        continue;
      }

      const token = loginData.token;
      console.log(`   🔑 Logged in successfully. Token acquired.`);

      // 2. Create Clinic
      const clinicRes = await fetch(`${API_BASE}/clinics/createClinic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(item.clinic)
      });

      const clinicText = await clinicRes.text();

      if (clinicRes.ok) {
        console.log(`   ✅ Clinic created successfully: "${item.clinic.clinic_name}" (${clinicText})`);
      } else {
        console.log(`   ⚠️ Failed to create clinic (${clinicRes.status}): ${clinicText}`);
      }

    } catch (err) {
      console.error(`   ❌ Error processing ${item.email}:`, err.message);
    }
  }

  console.log('\n🎉 Clinic seeding process completed!');
}

seedClinics();
