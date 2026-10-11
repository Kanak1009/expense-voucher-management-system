import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import VoucherList from './pages/VoucherList.jsx';
import VoucherForm from './pages/VoucherForm.jsx';
import VoucherDetail from './pages/VoucherDetail.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/vouchers" element={<VoucherList />} />
        <Route path="/vouchers/:id" element={<VoucherDetail />} />
        <Route path="/vouchers/new" element={<ProtectedRoute roles={['EMPLOYEE']}><VoucherForm /></ProtectedRoute>} />
        <Route path="/vouchers/:id/edit" element={<ProtectedRoute roles={['EMPLOYEE']}><VoucherForm /></ProtectedRoute>} />
        <Route path="/pending" element={<ProtectedRoute roles={['DIRECTOR']}><VoucherList pendingOnly /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
