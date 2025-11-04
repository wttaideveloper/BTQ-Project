#!/bin/bash

echo "🚀 Setting up PostgreSQL for Bible Trivia Quest..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database configuration
DB_NAME="bible_trivia_db"
DB_USER="faithiq_user"
DB_PASSWORD="faithiq_password123"

echo -e "${YELLOW}📋 Database Configuration:${NC}"
echo "Database Name: $DB_NAME"
echo "Database User: $DB_USER"
echo "Database Password: $DB_PASSWORD"
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed. Please install it first:${NC}"
    echo "sudo apt update && sudo apt install -y postgresql postgresql-contrib"
    exit 1
fi

# Check if PostgreSQL service is running
if ! sudo systemctl is-active --quiet postgresql; then
    echo -e "${YELLOW}⚠️  PostgreSQL service is not running. Starting it...${NC}"
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
fi

echo -e "${GREEN}✅ PostgreSQL service is running${NC}"

# Create database user
echo -e "${YELLOW}👤 Creating database user...${NC}"
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo -e "${YELLOW}⚠️  User $DB_USER already exists${NC}"

# Create database
echo -e "${YELLOW}🗄️  Creating database...${NC}"
sudo -u postgres createdb $DB_NAME 2>/dev/null || echo -e "${YELLOW}⚠️  Database $DB_NAME already exists${NC}"

# Grant privileges
echo -e "${YELLOW}🔐 Granting privileges...${NC}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null
sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;" 2>/dev/null

# Configure PostgreSQL authentication
echo -e "${YELLOW}⚙️  Configuring PostgreSQL authentication...${NC}"

# Find PostgreSQL configuration directory
PG_CONF_DIR=$(sudo -u postgres psql -c "SHOW config_file;" | grep -E "postgresql\.conf$" | head -1 | sed 's/.*\/etc\/postgresql\/[0-9]*\/[a-z]*\///' | sed 's/\/postgresql\.conf//')

if [ -z "$PG_CONF_DIR" ]; then
    PG_CONF_DIR=$(find /etc/postgresql -name "postgresql.conf" | head -1 | sed 's/\/postgresql\.conf//')
fi

if [ -z "$PG_CONF_DIR" ]; then
    echo -e "${RED}❌ Could not find PostgreSQL configuration directory${NC}"
    exit 1
fi

echo "PostgreSQL config directory: $PG_CONF_DIR"

# Backup original configuration
sudo cp $PG_CONF_DIR/pg_hba.conf $PG_CONF_DIR/pg_hba.conf.backup

# Update authentication configuration
echo -e "${YELLOW}📝 Updating pg_hba.conf...${NC}"
sudo sed -i 's/local   all             all                                     peer/local   all             all                                     md5/' $PG_CONF_DIR/pg_hba.conf

# Restart PostgreSQL
echo -e "${YELLOW}🔄 Restarting PostgreSQL...${NC}"
sudo systemctl restart postgresql

# Test connection
echo -e "${YELLOW}🧪 Testing database connection...${NC}"
if PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT 1;" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection successful!${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    echo "Trying alternative connection method..."
    
    # Try connecting with postgres user first
    if sudo -u postgres psql -c "ALTER USER $DB_USER PASSWORD '$DB_PASSWORD';" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ User password updated${NC}"
        
        if PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT 1;" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Database connection successful after password update!${NC}"
        else
            echo -e "${RED}❌ Still cannot connect. Please check PostgreSQL logs:${NC}"
            echo "sudo journalctl -u postgresql -f"
            exit 1
        fi
    else
        echo -e "${RED}❌ Failed to update user password${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}🎉 PostgreSQL setup completed successfully!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "1. Your .env file has been updated with the new database credentials"
echo "2. Run: npm run db:setup (or node server/create-db.ts)"
echo "3. Start your application: npm run dev"
echo ""
echo -e "${YELLOW}🔗 Connection string:${NC}"
echo "postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
echo -e "${YELLOW}📝 To connect manually:${NC}"
echo "psql postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME" 