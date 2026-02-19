import { useState } from 'react'
import Navbar from './components/Navbar'
import UploadPage from './pages/UploadPage'
import ResultsPage from './pages/ResultsPage'
import './index.css'

export default function App() {
  const [analysisData, setAnalysisData] = useState(null)
  const [fileName, setFileName] = useState('')

  const handleReset = () => {
    setAnalysisData(null)
    setFileName('')
  }

  return (
    <div className="app">
      <Navbar onReset={analysisData ? handleReset : null} />
      {!analysisData
        ? <UploadPage onResult={(data, name) => { setAnalysisData(data); setFileName(name) }} />
        : <ResultsPage data={analysisData} fileName={fileName} onReset={handleReset} />
      }
    </div>
  )
}
