# Ollama Performance Optimization Guide

## Current Performance

### Response Times
- **First Request**: 20-30 seconds (model loading into memory)
- **Subsequent Requests**: 2-5 seconds (model already loaded)
- **Token Generation Rate**: ~10 tokens/second (CPU mode)

## Why Is It Slow?

1. **CPU Processing**: Ollama is running without GPU acceleration
2. **Model Loading**: First request loads the 2GB model into memory
3. **Model Size**: llama3.2 is a 2GB model optimized for quality over speed

## Optimizations Applied

### ✅ Increased Timeouts
- Frontend timeout: 120 seconds
- Backend timeout: 120 seconds
- Prevents timeout errors during slow responses

### ✅ User Feedback
- Loading message shows "Loading AI model (this may take 20-30s)..." on first request
- Subsequent requests show "Thinking..." for faster feedback

### ✅ Model Keep-Alive
- Configured Ollama to keep model in memory for 5 minutes
- Reduces loading time for follow-up questions

## Additional Optimization Options

### Option 1: Use a Smaller/Faster Model

Switch to a smaller, faster model:

```powershell
# Pull a smaller model (faster but less capable)
docker exec ollama ollama pull llama3.2:1b

# Update backend/.env
OLLAMA_MODEL=llama3.2:1b
```

**Trade-offs:**
- ✅ 3-5x faster responses
- ✅ Less memory usage
- ❌ Lower quality responses
- ❌ Less context understanding

### Option 2: Enable GPU Acceleration (Recommended)

If you have an NVIDIA GPU:

1. Install NVIDIA Container Toolkit
2. Update `docker-compose.yml`:

```yaml
ollama:
  image: ollama/ollama:latest
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

3. Restart Ollama:
```powershell
docker-compose restart ollama
```

**Benefits:**
- ✅ 10-50x faster responses
- ✅ Better quality with larger models
- ✅ Can use more powerful models

### Option 3: Pre-warm the Model

Keep the model loaded by sending periodic requests:

```powershell
# Add to a scheduled task (every 4 minutes)
docker exec ollama ollama run llama3.2:latest "ping"
```

### Option 4: Use Quantized Models

Use quantized versions for better speed:

```powershell
# Pull quantized model (Q4 = 4-bit quantization)
docker exec ollama ollama pull llama3.2:latest-q4_0

# Update backend/.env
OLLAMA_MODEL=llama3.2:latest-q4_0
```

**Benefits:**
- ✅ 2-3x faster
- ✅ Less memory usage
- ❌ Slightly lower quality

## Performance Comparison

| Configuration | First Request | Subsequent | Quality | Memory |
|--------------|---------------|------------|---------|--------|
| Current (CPU) | 20-30s | 2-5s | High | 2GB |
| Smaller Model | 5-10s | 1-2s | Medium | 500MB |
| GPU Enabled | 2-5s | 0.5-1s | High | 2GB |
| Quantized | 10-15s | 1-3s | Good | 1GB |

## Monitoring Performance

### Check Model Load Time
```powershell
Measure-Command { 
  docker exec ollama ollama run llama3.2:latest "test" 
} | Select-Object TotalSeconds
```

### Check Token Generation Rate
```powershell
docker exec ollama ollama run llama3.2:latest "Hello" --verbose
```

Look for:
- `load duration`: Time to load model
- `eval rate`: Tokens per second

### Monitor Memory Usage
```powershell
docker stats ollama --no-stream
```

## Troubleshooting Slow Responses

### Issue: First request times out
**Solution**: Increase timeout in [`src/lib/api-client.ts`](src/lib/api-client.ts:31)
```typescript
timeout: 180000, // 3 minutes
```

### Issue: All requests are slow
**Possible causes:**
1. CPU is overloaded - check with Task Manager
2. Not enough RAM - Ollama needs 4GB+ free
3. Docker resource limits - increase in Docker Desktop settings

**Solutions:**
- Close other applications
- Increase Docker memory limit to 8GB+
- Use a smaller model
- Enable GPU acceleration

### Issue: Model keeps unloading
**Solution**: Increase keep-alive time
```powershell
docker exec ollama sh -c "export OLLAMA_KEEP_ALIVE=30m"
docker restart ollama
```

## Best Practices

1. **For Development**: Current setup is fine, accept the 20-30s first load
2. **For Production**: Enable GPU or use a smaller model
3. **For Demos**: Pre-warm the model before showing
4. **For Heavy Use**: Consider GPU acceleration

## Expected User Experience

### Current Setup (CPU)
- ✅ First question: 20-30 seconds (with loading message)
- ✅ Follow-up questions: 2-5 seconds
- ✅ Quality: High-quality responses
- ⚠️ Best for: Light usage, development

### With GPU
- ✅ First question: 2-5 seconds
- ✅ Follow-up questions: 0.5-1 second
- ✅ Quality: High-quality responses
- ✅ Best for: Production, heavy usage

## Next Steps

Choose based on your needs:

1. **Keep current setup**: Good for development and light usage
2. **Add GPU support**: Best for production and frequent use
3. **Use smaller model**: Quick fix for faster responses
4. **Use quantized model**: Balance between speed and quality

---

**Made with Bob** 🤖