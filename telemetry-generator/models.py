from pydantic import BaseModel, Field
from datetime import datetime

class TruckTelemetry(BaseModel):
    truck_id: str = Field(..., description="Unique truck identifier, e.g., TRK-001")
    ts: str = Field(..., description="ISO-8601 UTC timestamp")
    lat: float = Field(..., description="Current latitude")
    lon: float = Field(..., description="Current longitude")
    speed_kmph: float = Field(..., ge=0.0, description="Speed in km/h")
    fuel_pct: float = Field(..., ge=0.0, le=100.0, description="Fuel percentage remaining")
    cargo_temp_c: float = Field(..., description="Current cargo compartment temperature")
    setpoint_c: float = Field(..., description="Configured reefer setpoint temperature")
    door_open: bool = Field(..., description="Door sensor state: true=open, false=closed")
