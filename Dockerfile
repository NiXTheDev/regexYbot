# Use the official Bun image as the base image
# Choose a specific version for reproducibility, e.g., bun:1.1.14 or bun:latest
FROM oven/bun:latest

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and bun.lock (if it exists) first to leverage Docker layer caching
COPY package.json bun.lock* ./

# Install dependencies using bun install
# If you don't have a package.json or only use bun's native modules, you can skip this step
# and remove the package.json/bun.lock copy lines above.
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Expose any ports the app runs on, if applicable (e.g., for webhooks)
# EXPOSE 3000

# Run the application using bun
CMD ["bun", "run", "index.ts"]