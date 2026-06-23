#!/bin/bash

echo "=========================================="
echo "Restarting Docker Services"
echo "=========================================="
echo ""

# Stop all services
echo "Stopping services..."
docker-compose down

echo ""
echo "Rebuilding frontend (nginx config changed)..."
docker-compose build frontend

echo ""
echo "Starting all services..."
docker-compose up -d

echo ""
echo "Waiting for services to start..."
sleep 10

echo ""
echo "Service Status:"
docker-compose ps

echo ""
echo "=========================================="
echo "Testing Connections"
echo "=========================================="

echo ""
echo "1. Testing backend health..."
curl -s http://localhost:8000/health | python -m json.tool || echo "Backend not responding"

echo ""
echo "2. Testing frontend..."
curl -s -o /dev/null -w "Frontend Status: %{http_code}\n" http://localhost/

echo ""
echo "3. Testing API proxy..."
curl -s -o /dev/null -w "API Proxy Status: %{http_code}\n" http://localhost/api/health

echo ""
echo "=========================================="
echo "Services restarted!"
echo "=========================================="
echo ""
echo "Access dashboard at: http://localhost"
echo ""
echo "View logs with: docker-compose logs -f"
echo ""

# Made with Bob
