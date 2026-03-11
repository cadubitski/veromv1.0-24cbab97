import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Financeiro from "./pages/admin/Financeiro";
import Usuarios from "./pages/admin/Usuarios";
import Clientes from "./pages/cadastros/Clientes";
import Imoveis from "./pages/cadastros/Imoveis";
import Inquilinos from "./pages/cadastros/Inquilinos";
import GestaoAluguel from "./pages/movimentos/GestaoAluguel";
import Repasse from "./pages/relatorios/Repasse";
import ModelosDocumentos from "./pages/documentos/ModelosDocumentos";
import EditorModelo from "./pages/documentos/EditorModelo";
import TabelaIR from "./pages/cadastros/TabelaIR";
import Dimob from "./pages/relatorios/Dimob";
import InformeRendimentos from "./pages/relatorios/InformeRendimentos";
import ContasBancarias from "./pages/financeiro/ContasBancarias";
import MovimentacaoBancaria from "./pages/financeiro/MovimentacaoBancaria";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/admin/financeiro" element={<ProtectedRoute requireAdmin><Financeiro /></ProtectedRoute>} />
            <Route path="/admin/usuarios" element={<ProtectedRoute requireAdmin><Usuarios /></ProtectedRoute>} />
            <Route path="/cadastros/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
            <Route path="/cadastros/clientes/:clientId/imoveis" element={<ProtectedRoute><Imoveis /></ProtectedRoute>} />
            <Route path="/cadastros/imoveis" element={<ProtectedRoute><Imoveis /></ProtectedRoute>} />
            <Route path="/cadastros/inquilinos" element={<ProtectedRoute><Inquilinos /></ProtectedRoute>} />
            <Route path="/cadastros/tabela-ir" element={<ProtectedRoute><TabelaIR /></ProtectedRoute>} />
            <Route path="/movimentos/gestao-aluguel" element={<ProtectedRoute><GestaoAluguel /></ProtectedRoute>} />
            <Route path="/relatorios/repasse" element={<ProtectedRoute><Repasse /></ProtectedRoute>} />
            <Route path="/relatorios/dimob" element={<ProtectedRoute><Dimob /></ProtectedRoute>} />
            <Route path="/relatorios/informe-rendimentos" element={<ProtectedRoute><InformeRendimentos /></ProtectedRoute>} />
            <Route path="/financeiro/contas-bancarias" element={<ProtectedRoute><ContasBancarias /></ProtectedRoute>} />
            <Route path="/financeiro/movimentacao-bancaria" element={<ProtectedRoute><MovimentacaoBancaria /></ProtectedRoute>} />
            <Route path="/documentos/modelos" element={<ProtectedRoute><ModelosDocumentos /></ProtectedRoute>} />
            <Route path="/documentos/modelos/:id" element={<ProtectedRoute><EditorModelo /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
