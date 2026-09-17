/**
 * Cross-platform Node.js script to associate each user (IDs 5 to 14) as a Doctor/Owner
 * to their respective clinic (IDs 1 to 10) on the MedAgenda backend.
 * 
 * Run with: node seed-clinic-members.js
 */

const API_BASE = 'https://med-agenda-1-three.vercel.app';

const associations = [
  { email: 'carlos.martinez@cardiosalud.com', password: '12345678', clinic_id: 1, user_id: 5, role: 'Doctor' },
  { email: 'maria.lopez@neurocentro.com', password: '12345678', clinic_id: 2, user_id: 6, role: 'Doctor' },
  { email: 'ana.torres@pediatricoarcoiris.com', password: '12345678', clinic_id: 3, user_id: 7, role: 'Doctor' },
  { email: 'sofia.herrera@mujervital.com', password: '12345678', clinic_id: 4, user_id: 8, role: 'Doctor' },
  { email: 'jorge.suarez@dermaclinic.com', password: '12345678', clinic_id: 5, user_id: 9, role: 'Doctor' },
  { email: 'ricardo.morales@oncologico.com', password: '12345678', clinic_id: 6, user_id: 10, role: 'Doctor' },
  { email: 'laura.vargas@equilibriomental.com', password: '12345678', clinic_id: 7, user_id: 11, role: 'Doctor' },
  { email: 'fernando.ruiz@visionclara.com', password: '12345678', clinic_id: 8, user_id: 12, role: 'Doctor' },
  { email: 'gabriel.mendez@saludauditiva.com', password: '12345678', clinic_id: 9, user_id: 13, role: 'Doctor' },
  { email: 'miguel.ramos@traumaclinic.com', password: '12345678', clinic_id: 10, user_id: 14, role: 'Doctor' },
];

async function seedMembers() {
  console.log('🩺 Starting clinic doctor association against Aiven / Vercel...');
  console.log(`Target API: ${API_BASE}\n`);

  for (let i = 0; i < associations.length; i++) {
    const item = associations[i];
    console.log(`[${i + 1}/${associations.length}] Associating User ID ${item.user_id} (${item.email}) to Clinic ID ${item.clinic_id}...`);

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

      // 2. Add Member to Clinic
      const memberRes = await fetch(`${API_BASE}/clinics/addMemberToClinic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clinic_id: item.clinic_id,
          user_id: item.user_id,
          role_within_clinic: item.role,
          role_description: 'Médico especialista y miembro titular'
        })
      });

      const memberText = await memberRes.text();

      if (memberRes.ok) {
        console.log(`   ✅ Successfully associated doctor to clinic ID ${item.clinic_id}`);
      } else {
        console.log(`   ⚠️ Failed to associate member (${memberRes.status}): ${memberText}`);
      }

    } catch (err) {
      console.error(`   ❌ Error processing ${item.email}:`, err.message);
    }
  }

  console.log('\n🎉 Doctor-Clinic association process completed!');
}

seedMembers();
