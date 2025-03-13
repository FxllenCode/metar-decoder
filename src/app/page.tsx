"use client"

import { useState, FormEvent } from "react";

export default function Home() {
  const [airport, setAirport] = useState("");
  const [tempUnit, setTempUnit] = useState("C");
  const [altUnit, setAltUnit] = useState("inHg");
  const [loading, setLoading] = useState(false);
  const [metar, setMetar] = useState<string | null>(null);
  const [isAdditionalInfoExpanded, setIsAdditionalInfoExpanded] = useState(false);
  const [decodedData, setDecodedData] = useState<{
    name: string;
    station: string;
    elevation: number;
    time: string;
    wind: string;
    visibility: string;
    ceiling: string;
    temperature: {
      farenheit: string;
      celsius: string;
    }
    dewpoint: {
      farenheit: string;
      celsius: string;
    }
    altimeter: {
      hpa: string;
      inHg: string;
    }
  } | null>(null);
  const [flightCategory, setFlightCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMetar = async (e: FormEvent) => {
    e.preventDefault();
    if (!airport) return;

    setLoading(true);
    setError(null);
    setMetar(null);
    setDecodedData(null);
    setFlightCategory(null);

    try {
      // Always use the CORS proxy regardless of environment
      const corsProxyUrl = "https://corsproxy.io/?";
      const requestUrl = corsProxyUrl + encodeURIComponent(
        `https://aviationweather.gov/api/data/metar?ids=${airport.toUpperCase()}&format=json`
      );

      const response = await fetch(requestUrl);

      if (!response.ok) {
        throw new Error("Failed to fetch METAR data");
      }

      const data = await response.json();

      if (!data.length) {
        throw new Error("No METAR data found for this airport code");
      }

      const metarData = data[0];
      setMetar(metarData.rawOb);

      function getWind()  {
        let stringToReturn = "";
        if (metarData.wspd && (metarData.wdir != "VRB")) {
          stringToReturn = `${metarData.wdir}° at ${metarData.wspd} knots`;
        } else if (metarData.wspd == 0 && metarData.wdir == 0) {
          stringToReturn = `Calm`;
        } 
        else if (metarData.wdir == "VRB") {
          stringToReturn = `Variable at ${metarData.wspd} knots`;
        } else {
          stringToReturn = "Calm";
        }
        if (metarData.wgst) {
          stringToReturn += `, gusting to ${metarData.wgst} knots`;
        }
        return stringToReturn;
      }
      const metarTime = metarData.rawOb.match(/\d{6}Z/);

      const decoded = {
        name: metarData.name || "Unknown",
        station: metarData.icaoId || "Unknown",
        elevation: metarData.elev *  3.281,
        time: metarTime ? `${metarTime[0].slice(2, 4)}:${metarTime[0].slice(4, 6)} UTC` : "Unknown",
        wind: getWind(),
        visibility: `${metarData.visib || '---'} statute miles`,
        ceiling: "None", // Will calculate below if available
        temperature:
        {
          farenheit: `${((metarData.temp * (9 / 5) + 32)).toFixed(1) || '---'}°F`,
          celsius: `${(metarData.temp).toFixed(1) || '---'}°C`
        },
        dewpoint: {
          farenheit: `${((metarData.dewp * (9 / 5) + 32)).toFixed(1) || '---'}°F`,
          celsius: `${(metarData.dewp).toFixed(1) || '---'}°C`
        },
        altimeter: {
          hpa: `${metarData.altim || '---'} hPa`,
          inHg: `${getAltimeter(metarData.rawOb, metarData.altim)?.toFixed(2) || '---'} inHg`
        }
      };


      if (metarData.clouds && metarData.clouds.length) {
               
         
        // disable eslint for the next line because it's a hack to get the first layer of clouds
        // eslint-disable-next-line
        const ceilingLayer = metarData.clouds.find((cloud: any) =>
          ["OVC", "BKN"].includes(cloud.cover)
        );

        if (ceilingLayer) {
          decoded.ceiling = `${ceilingLayer.base} feet`;
        }
      }

      setDecodedData(decoded);

      const visibility = metarData.visib ? parseFloat(metarData.visib) : Infinity;

      let ceiling = Infinity;
      if (metarData.clouds && metarData.clouds.length) {
        // disable eslint for the next line because it's a hack to get the first layer of clouds
        // eslint-disable-next-line
        const ceilingLayer = metarData.clouds.find((cloud: any) =>
          ["OVC", "BKN"].includes(cloud.cover)
        );

        if (ceilingLayer) {
          ceiling = ceilingLayer.base;
        }
      }

      let category;
      if (ceiling < 500 || visibility < 1) {
        category = "LIFR";
      } else if (ceiling < 1000 || visibility < 3) {
        category = "IFR";
      } else if (ceiling < 3000 || visibility < 5) {
        category = "MVFR";
      } else {
        category = "VFR";
      }

      setFlightCategory(category);

    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "VFR":
        return "bg-green-500";
      case "MVFR":
        return "bg-blue-500";
      case "IFR":
        return "bg-red-500";
      case "LIFR":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  const getAltimeter = (rawMetar: string, dataHpa: number): number | undefined => {
    const altimeterMatch = rawMetar.match(/A(\d{4})/);

    if (altimeterMatch) {
      const altimeterValue = (parseInt(altimeterMatch[1]) / 100);
      console.log(altimeterValue);
      const hpaToInHg = dataHpa * 0.02953;
      console.log(hpaToInHg);
      const difference = Math.abs(altimeterValue - hpaToInHg);
      if (difference <= 0.05) {
        return altimeterValue;
      }
    }

    return;
  }

  const calculatePressureAltitude = (altimeterInHg: number, elevation: number): number => {
    return Math.round(((29.92 - altimeterInHg) * 1000) + elevation);
  };

  const calculateDensityAltitude = (pressureAltitude: number, tempCelsius: number): number => {
    const isaTemp = 15 - (pressureAltitude / 1000) * 2;
    return Math.round(pressureAltitude + (120 * (tempCelsius - isaTemp)));
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">
          METAR Decoder & Flight Category
        </h1>

        <form onSubmit={fetchMetar} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={airport}
              onChange={(e) => setAirport(e.target.value)}
              placeholder="Enter airport code (e.g., KJFK)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Get METAR"}
            </button>
          </div>
        </form>

        {error && (
          <div className="p-4 mb-6 bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900 dark:text-red-200">
            <p>{error}</p>
          </div>
        )}
        {decodedData?.name && (
          <h1 className="text-2xl font-semibold mb-4 text-center">{decodedData.name}</h1>
        )}

        
        {metar && (
          <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-2">Raw METAR</h2>
            <p className="font-mono p-3 bg-gray-100 dark:bg-gray-700 rounded overflow-x-auto">
              {metar}
            </p>
          </div>
        )}

        {decodedData && (
          <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Decoded Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Station</p>
                <p>{decodedData.station}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Time</p>
                <p>{decodedData.time}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Wind</p>
                <p>{decodedData.wind}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Visibility</p>
                <p>{decodedData.visibility}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ceiling</p>
                <p>{decodedData.ceiling}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Temperature</p>
                <div 
                  className="flex flex-col cursor-pointer group transition-all duration-200"
                  onClick={() => setTempUnit(tempUnit === "C" ? "F" : "C")}>
                  <p className="group-hover:scale-105 transition-transform origin-left">
                  {tempUnit === "C" ? decodedData.temperature.celsius : decodedData.temperature.farenheit}
                  <span
                    className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors"
                  >
                    {" "}(show in °{tempUnit === "C" ? "F" : "C"})
                  </span>
                  </p>
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Dewpoint</p>
                <div 
                  className="flex flex-col cursor-pointer group transition-all duration-200"
                  onClick={() => setTempUnit(tempUnit === "C" ? "F" : "C")}>
                  <p className="group-hover:scale-105 transition-transform origin-left">
                  {tempUnit === "C" ? decodedData.dewpoint.celsius : decodedData.dewpoint.farenheit}
                  <span
                    className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors"
                  >
                    {" "}(show in °{tempUnit === "C" ? "F" : "C"})
                  </span>
                  </p>
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Altimeter</p>
                <div 
                  className="flex flex-col cursor-pointer group transition-all duration-200"
                  onClick={() => setAltUnit(altUnit === "inHg" ? "hPa" : "inHg")}>
                  <p className="group-hover:scale-105 transition-transform origin-left">
                  {altUnit === "inHg" ? decodedData.altimeter.inHg : decodedData.altimeter.hpa}
                  <span
                    className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors"
                  >
                    {" "}(show in {altUnit === "inHg" ? "hPa" : "inHg"})
                  </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {decodedData && (
          <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Additional Information</h2>
              <button 
                onClick={() => setIsAdditionalInfoExpanded(!isAdditionalInfoExpanded)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
              >
                <svg 
                  className={`w-6 h-6 transition-transform ${isAdditionalInfoExpanded ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
            </div>
            
            {isAdditionalInfoExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {decodedData.altimeter.inHg !== '---' && (
                  <>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pressure Altitude</p>
                      <p>
                        {calculatePressureAltitude(parseFloat(decodedData.altimeter.inHg), decodedData.elevation).toLocaleString()} feet
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Based on standard pressure (29.92 inHg)</p>
                    </div>
                    
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Density Altitude</p>
                      <p>
                        {calculateDensityAltitude(
                          calculatePressureAltitude(parseFloat(decodedData.altimeter.inHg), decodedData.elevation),
                          parseFloat(decodedData.temperature.celsius)
                        ).toLocaleString()} feet
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Based on temperature and pressure altitude</p>
                    </div>
                    
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Relative Humidity</p>
                      <p>
                        {(() => {
                          const tempC = parseFloat(decodedData.temperature.celsius);
                          const dewpointC = parseFloat(decodedData.dewpoint.celsius);
                          const es = 6.11 * Math.exp((7.5 * tempC) / (237.3 + tempC));
                          const e = 6.11 * Math.exp((7.5 * dewpointC) / (237.3 + dewpointC));
                          const rh = Math.round((e / es) * 100);
                          return isNaN(rh) ? "Not available" : `${rh}%`;
                        })()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Based on temp/dewpoint spread</p>
                    </div>
                    
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Air Density</p>
                      <p>
                        {(() => {
                          const altimInHg = parseFloat(decodedData.altimeter.inHg);
                          const tempC = parseFloat(decodedData.temperature.celsius);
                          const pressurePa = altimInHg * 3386.39;
                          const tempK = tempC + 273.15;
                          const density = (pressurePa) / (287.05 * tempK);
                          return isNaN(density) ? "Not available" : `${density.toFixed(3)} kg/m³`;
                        })()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Standard sea level: 1.225 kg/m³</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {flightCategory && (
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow text-center">
            <h2 className="text-xl font-semibold mb-4">Flight Category</h2>
            <div className={`inline-block px-6 py-3 rounded-full text-white font-bold ${getCategoryColor(flightCategory)}`}>
              {flightCategory}
            </div>
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              <p>VFR: Ceiling &gt; 3000ft and Visibility &gt; 5mi</p>
              <p>MVFR: Ceiling 1000-3000ft or Visibility 3-5mi</p>
              <p>IFR: Ceiling 500-1000ft or Visibility 1-3mi</p>
              <p>LIFR: Ceiling &lt; 500ft or Visibility &lt; 1mi</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}