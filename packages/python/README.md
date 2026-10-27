# au1h for Python

```bash
pip install au1h            # add [fastapi] for the FastAPI helpers
```

```python
from fastapi import Depends, FastAPI
from au1h import User, Verifier
from au1h.fastapi import require_user

au1h = Verifier("https://auth.example.com", "my-app")
current_user = require_user(au1h)

@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user
```

Behind the gateway: `require_proxy(au1h)` reads `x-user-*` and verifies `x-au1h-token`.
Server-to-server: `ServerClient(url, slug, secret).introspect(token)`.
