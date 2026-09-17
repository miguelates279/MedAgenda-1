"use client";
import React from "react";
import { FaUsersCog, FaChartBar, FaBuilding, FaTrash } from "react-icons/fa";
import useAdminDashboard from "../../../hooks/useAdminDashboard";
import Heading from "../../../components/atoms/Heading";
import TabButton from "../../../components/atoms/TabButton";
import Select from "../../../components/atoms/Select";
import Alert from "../../../components/atoms/Alert";
import AdminUsersSection from "../../../components/molecules/AdminUsersSection";
import UserRoleModal from "../../../components/molecules/UserRoleModal";

export default function AHome() {
  const dashboard = useAdminDashboard();

  if (dashboard.authLoading || dashboard.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Cargando panel de administración...</p>
      </div>
    );
  }

  const selectedClinic = dashboard.userClinics.find((c) => c.clinic_id === dashboard.selectedClinicId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Heading text="Panel del" highlight="Administrador" />
          {selectedClinic && (
            <p className="text-gray-600 mt-2 flex items-center gap-2">
              <FaBuilding className="text-[#4682B4]" />
              Clínica: <span className="font-semibold text-gray-800">{selectedClinic.clinic_name}</span>
            </p>
          )}
        </div>

        {/* Clinic Selector */}
        {dashboard.userClinics.length > 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <Select
              label={dashboard.userClinics.length > 1 ? 'Seleccionar Clínica' : 'Clínica Actual'}
              icon={<FaBuilding />}
              value={dashboard.selectedClinicId || ''}
              onChange={(value) => dashboard.setSelectedClinicId(Number(value))}
              options={dashboard.userClinics.map((clinic) => ({
                value: clinic.clinic_id,
                label: `${clinic.clinic_name} (${clinic.role_within_clinic})`,
              }))}
              disabled={dashboard.userClinics.length === 1}
              helpText={dashboard.userClinics.length === 1 ? 'Solo administras esta clínica' : undefined}
            />
            {selectedClinic?.role_within_clinic === 'Owner' && (
              <button
                type="button"
                onClick={() => dashboard.handleDeleteClinic(selectedClinic.clinic_id)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <FaTrash aria-hidden="true" />
                Eliminar clínica
              </button>
            )}
          </div>
        ) : (
          <Alert variant="warning" className="mb-6">
            <p className="font-semibold">⚠️ No se encontraron clínicas</p>
            <p className="text-sm mt-1">
              No tienes acceso a ninguna clínica como administrador. Contacta al soporte si esto es un error.
            </p>
          </Alert>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <TabButton
            label="Gestión de Usuarios"
            icon={<FaUsersCog />}
            active={dashboard.activeTab === 'users'}
            onClick={() => dashboard.setActiveTab('users')}
          />
          <TabButton
            label="Estadísticas"
            icon={<FaChartBar />}
            active={dashboard.activeTab === 'stats'}
            onClick={() => dashboard.setActiveTab('stats')}
          />
        </div>

        {/* Content */}
        {dashboard.activeTab === 'users' ? (
          <AdminUsersSection
            users={dashboard.users}
            filteredUsers={dashboard.filteredUsers}
            searchEmail={dashboard.searchEmail}
            successMessage={dashboard.successMessage}
            error={dashboard.error}
            onSearchChange={dashboard.setSearchEmail}
            onSearch={dashboard.handleSearch}
            onClearSearch={dashboard.handleClearSearch}
            onEditUser={dashboard.handleEditUser}
          />
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <FaChartBar className="mx-auto text-6xl text-gray-300 mb-4" />
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Estadísticas del Sistema</h3>
            <p className="text-gray-600">Esta sección estará disponible próximamente</p>
          </div>
        )}
      </div>

      {/* Edit Role Modal */}
      <UserRoleModal
        editingUser={dashboard.editingUser}
        roleForm={dashboard.roleForm}
        specialties={dashboard.specialties}
        isSaving={dashboard.isSaving}
        onRoleFormChange={dashboard.setRoleForm}
        onSave={dashboard.handleSaveRole}
        onCancel={dashboard.handleCancelEdit}
      />
    </div>
  );
}
