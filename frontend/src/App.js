import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { SettingsProvider } from "./context/SettingsContext";
import { BottomNav } from "./components/BottomNav";
import Home from "./pages/Home";
import Rangefinder from "./pages/Rangefinder";
import Scorecard from "./pages/Scorecard";
import Caddie from "./pages/Caddie";
import Bag from "./pages/Bag";
import More from "./pages/More";
import Courses from "./pages/Courses";
import CourseEditor from "./pages/CourseEditor";
import StartRound from "./pages/StartRound";
import History from "./pages/History";
import RoundDetail from "./pages/RoundDetail";
import Stats from "./pages/Stats";

const NAV_PATHS = ["/play", "/play/score", "/play/caddie", "/bag", "/more"];

function Shell() {
  const loc = useLocation();
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play" element={<Rangefinder />} />
        <Route path="/play/score" element={<Scorecard />} />
        <Route path="/play/caddie" element={<Caddie />} />
        <Route path="/bag" element={<Bag />} />
        <Route path="/more" element={<More />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id/edit" element={<CourseEditor />} />
        <Route path="/start-round" element={<StartRound />} />
        <Route path="/history" element={<History />} />
        <Route path="/rounds/:id" element={<RoundDetail />} />
        <Route path="/stats" element={<Stats />} />
      </Routes>
      {NAV_PATHS.includes(loc.pathname) && <BottomNav />}
    </>
  );
}

function App() {
  return (
    <div className="App">
      <SettingsProvider>
        <BrowserRouter>
          <Shell />
          <Toaster position="top-center" richColors />
        </BrowserRouter>
      </SettingsProvider>
    </div>
  );
}

export default App;
