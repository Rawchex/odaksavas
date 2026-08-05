Deploying BLUNK to GitHub + Railway

This guide prepares the repository for GitHub and Railway deployment and shows the steps to push and configure Railway.

1) Ensure code is committed locally

```bash
git init
git add .
git commit -m "Prepare repo for deployment"
```

2) Create a GitHub repository and add remote

```bash
git remote add origin git@github.com:yourusername/your-repo.git
git push -u origin main
# or if your default branch is master
git push -u origin master
```

3) Set repository secrets on GitHub

Go to your repo -> Settings -> Secrets and variables -> Actions -> New repository secret and add:
- `RAILWAY_TOKEN`: your Railway personal token
- `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD` (if using static TURN credentials)
- `JWT_SECRET` and any DB/production env vars

4) Connect Railway

Option A — GitHub integration (recommended):
- On Railway.app, create a new project -> Deploy from GitHub -> select your repo -> choose branch `main`.
- Add Environment variables in Railway's dashboard matching the repo secrets above.

Option B — CLI deploy
- Install Railway CLI locally and login:
```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

5) Verify deployment
- Open the Railway project URL or the custom domain and test voice features with two devices on separate networks.

Notes
- The GitHub Action `ci.yml` will attempt to deploy to Railway automatically when `RAILWAY_TOKEN` is set.
- For production TURN, follow `docs/turn-setup.md` and add `TURN_*` env vars in Railway.

If you'd like, I can:
- Initialize git and make the initial commit here, then guide you through adding the remote and pushing.
- Or, if you provide GitHub remote and a Railway token (as an Actions secret), I can trigger a workflow run (not stored here).
