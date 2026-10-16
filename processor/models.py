from pydantic import BaseModel, Field
from typing import Optional

class TelemetryMessage(BaseModel):
    truck_id: str = Field(..., description="Truck identifier")
    ts: str = Field(..., description="ISO-8601 UTC timestamp")
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")
    speed_kmph: float = Field(..., ge=0.0, description="Speed in km/h")
    fuel_pct: float = Field(..., ge=0.0, le=100.0, description="Fuel percentage")
    cargo_temp_c: float = Field(..., description="Cargo temperature in Celsius")
    setpoint_c: float = Field(..., description="Setpoint temperature in Celsius")
    door_open: bool = Field(..., description="Door sensor state")

class LiveStatusRecord(BaseModel):
    truck_id: str
    last_ts: str
    lat: float
    lon: float
    speed_kmph: float
    fuel_pct: float
    cargo_temp_c: float
    setpoint_c: float
    door_open: bool
    status: str
    excess_temp_c: float
    updated_at: str

class AlertRecord(BaseModel):
    truck_id: str
    ts: str
    status: str
    cargo_temp_c: float
    setpoint_c: float
    excess_temp_c: float
    door_open: bool
    reason: str
    created_at: str
