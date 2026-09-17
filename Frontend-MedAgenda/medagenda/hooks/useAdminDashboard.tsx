import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from './useAuth';
import {
  getClinicUsers,
  searchUserByEmail,
  updateUserRole,
  getSpecialties,
  getMyClinics,
  deleteClinic,
  addMemberToClinic,
} from '../libs/adminService';
import { ClinicUser, UpdateUserRoleDTO, Specialty, UserClinic, AddMemberToClinicDTO } from '../interfaces/adminUser';

export default function useAdminDashboard() {
  const router = useRouter();
  const { isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'stats'>('users');
  const [users, setUsers] = useState<ClinicUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ClinicUser[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [userClinics, setUserClinics] = useState<UserClinic[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState('');
  const [editingUser, setEditingUser] = useState<ClinicUser | null>(null);
  const [isNewMember, setIsNewMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [roleForm, setRoleForm] = useState({
    is_doctor: false,
    is_admin: false,
    specialty_id: undefined as number | undefined,
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, isAdmin, router]);

  useEffect(() => {
    const fetchClinics = async () => {
      try {
        const clinicsData = await getMyClinics();
        const uniqueClinics = clinicsData.filter(
          (clinic, index, self) => index === self.findIndex((c) => c.clinic_id === clinic.clinic_id)
        );
        setUserClinics(uniqueClinics);
        if (uniqueClinics.length > 0) {
          setSelectedClinicId(uniqueClinics[0].clinic_id);
        }
      } catch (error: any) {
        setError('No se pudieron cargar las clínicas. Por favor, intenta de nuevo.');
      }
    };

    if (isAuthenticated && isAdmin) {
      fetchClinics();
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedClinicId) return;

      try {
        setIsLoading(true);
        const usersData = await getClinicUsers(selectedClinicId);
        const specialtiesData = await getSpecialties();
        setUsers(usersData);
        setFilteredUsers(usersData);
        setSpecialties(specialtiesData || []);
      } catch (error: any) {
        setError('No se pudo cargar la información. Por favor, intenta de nuevo.');
      } finally {
        setIsLoading(false);
      }
    };

    if (isAuthenticated && isAdmin && selectedClinicId) {
      fetchData();
    }
  }, [isAuthenticated, isAdmin, selectedClinicId]);

  const handleSearch = async () => {
    if (!searchEmail.trim()) {
      setFilteredUsers(users);
      return;
    }

    try {
      setError(null);
      const user = await searchUserByEmail(searchEmail);
      const isInClinic = users.some((u) => u.user_id === user.user_id);

      if (!isInClinic) {
        setSuccessMessage(
          `Usuario encontrado: ${user.first_name} ${user.first_last_name}. Haz clic en "Agregar a Clínica" para añadirlo.`
        );
      }

      setFilteredUsers([user]);
    } catch (error: any) {
      if (error.message.includes('404')) {
        setError('No se encontró ningún usuario con ese email.');
      } else {
        setError('Error al buscar el usuario.');
      }
      setFilteredUsers([]);
    }
  };

  const handleClearSearch = () => {
    setSearchEmail('');
    setFilteredUsers(users);
    setError(null);
  };

  const handleEditUser = (user: ClinicUser, isNew: boolean = false) => {
    setEditingUser(user);
    setIsNewMember(isNew);
    setRoleForm({
      is_doctor: user.is_doctor || false,
      is_admin: user.is_admin || false,
      specialty_id: undefined,
    });
    setError(null);
    setSuccessMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setRoleForm({
      is_doctor: false,
      is_admin: false,
      specialty_id: undefined,
    });
    setError(null);
  };

  const handleSaveRole = async () => {
    if (!editingUser || !selectedClinicId) return;

    if (roleForm.is_doctor && !roleForm.specialty_id) {
      setError('Debes seleccionar una especialidad para el doctor.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let updatedUser: ClinicUser;

      if (isNewMember) {
        const addData: AddMemberToClinicDTO = {
          clinic_id: selectedClinicId,
          user_id: editingUser.user_id,
          role_within_clinic: roleForm.is_admin ? 'Admin' : 'Doctor',
          role_description:
            roleForm.is_doctor && roleForm.specialty_id
              ? `Doctor - ${specialties.find((s) => s.specialty_id === roleForm.specialty_id)?.specialty_name}`
              : undefined,
        };

        const response = await addMemberToClinic(addData);
        updatedUser = response || {
          ...editingUser,
          is_admin: roleForm.is_admin,
          is_doctor: roleForm.is_doctor,
          specialty_name: roleForm.specialty_id
            ? specialties.find((s) => s.specialty_id === roleForm.specialty_id)?.specialty_name
            : undefined,
        };

        const updatedUsers = [...users, updatedUser];
        setUsers(updatedUsers);
        setFilteredUsers(updatedUsers);

        setSuccessMessage(`${editingUser.first_name} ${editingUser.first_last_name} agregado exitosamente a la clínica`);
      } else {
        const updateData: UpdateUserRoleDTO = {
          email: editingUser.user_email_address,
          isDoctor: roleForm.is_doctor,
          isAdmin: roleForm.is_admin,
          specialty_id: roleForm.is_doctor ? roleForm.specialty_id : undefined,
        };

        updatedUser = await updateUserRole(updateData);

        const updatedUsers = users.map((u) => (u.user_id === updatedUser.user_id ? updatedUser : u));
        setUsers(updatedUsers);

        if (searchEmail.trim()) {
          setFilteredUsers([updatedUser]);
        } else {
          setFilteredUsers(updatedUsers);
        }

        setSuccessMessage(`Rol actualizado exitosamente para ${updatedUser.first_name} ${updatedUser.first_last_name}`);
      }

      setEditingUser(null);
      setIsNewMember(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      let errorMessage = isNewMember ? 'No se pudo agregar el usuario a la clínica. ' : 'No se pudo actualizar el rol. ';
      if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Error desconocido. Revisa la consola para más detalles.';
      }
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClinic = async (clinicId: number) => {
    const clinic = userClinics.find((item) => item.clinic_id === clinicId);
    if (!clinic || clinic.role_within_clinic !== 'Owner') return;
    if (!window.confirm(`¿Eliminar la clínica "${clinic.clinic_name}"? Esta acción no se puede deshacer.`)) return;

    try {
      setError(null);
      await deleteClinic(clinicId);
      const remainingClinics = userClinics.filter((item) => item.clinic_id !== clinicId);
      setUserClinics(remainingClinics);
      if (selectedClinicId === clinicId) {
        setSelectedClinicId(remainingClinics[0]?.clinic_id ?? null);
      }
      setSuccessMessage('Clínica eliminada correctamente.');
    } catch (error: any) {
      setError(error.message || 'No se pudo eliminar la clínica.');
    }
  };

  return {
    authLoading,
    isLoading,
    activeTab,
    users,
    filteredUsers,
    specialties,
    userClinics,
    selectedClinicId,
    searchEmail,
    editingUser,
    isNewMember,
    error,
    successMessage,
    isSaving,
    roleForm,
    setActiveTab,
    setSearchEmail,
    setSelectedClinicId,
    setRoleForm,
    handleSearch,
    handleClearSearch,
    handleEditUser,
    handleCancelEdit,
    handleSaveRole,
    handleDeleteClinic,
  };
}
