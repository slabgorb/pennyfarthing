import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tailwind.css';
import './css/theme-system.css';

// React entry point for Cyclist
const container = document.getElementById('react-root');
if (container) {
  createRoot(container).render(<App />);
}
