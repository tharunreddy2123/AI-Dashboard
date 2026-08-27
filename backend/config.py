from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    # OpenShift Configuration
    openshift_api_url: str = "https://api.rm3.7wse.p1.openshiftapps.com:6443"
    openshift_token: str = ""

    # IBM watsonx.ai Configuration
    watsonx_api_key: str = ""
    watsonx_base_url: str = "https://eu-gb.ml.cloud.ibm.com"
    watsonx_project_id: str = ""
    watsonx_model: str = "meta-llama/llama-3-3-70b-instruct"

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
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"

settings = Settings()
