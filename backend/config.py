from pydantic_settings import BaseSettings
from typing import Optional, List

class Settings(BaseSettings):
    # OpenShift Configuration (loaded from backend/.env file)
    openshift_api_url: str = "https://api.rm3.7wse.p1.openshiftapps.com:6443"
    openshift_token: str = ""  # Must be set in backend/.env file
    
    # Ollama Configuration
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    
    # ChromaDB Configuration
    chroma_persist_dir: str = "./chroma_db"
    
    # API Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    # CORS Configuration
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    
    # Environment
    environment: str = "development"
    
    # Connection retry settings
    max_retries: int = 3
    retry_delay: int = 2
    request_timeout: int = 30
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        origins = [origin.strip() for origin in self.cors_origins.split(",")]
        # In production, add wildcard only if explicitly set
        if self.environment == "production" and "*" not in origins:
            return origins
        return origins
    
    @property
    def is_production(self) -> bool:
        """Check if running in production"""
        return self.environment.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development"""
        return self.environment.lower() == "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

# Made with Bob
