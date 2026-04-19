import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Interview from './pages/Interview'
import Report from './pages/Report'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/interview/:sessionId" element={<Interview />} />
        <Route path="/report/:sessionId" element={<Report />} />
      </Routes>
    </BrowserRouter>
  )
}
