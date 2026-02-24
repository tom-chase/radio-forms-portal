#!/bin/bash
#
# NUC Environment Setup Script
# Run on the NUC after OS installation to prepare for Radio Forms Portal deployment.
#
# Usage (on NUC, as root or with sudo):
#   sudo bash /path/to/nuc-setup.sh
#
# What it does:
#   - Installs Docker, docker-compose, and required packages
#   - Configures Docker daemon for production
#   - Configures UFW firewall (SSH via WireGuard VPN only, HTTP/HTTPS/51820 open)
#   - Installs WireGuard
#   - Disables Wi-Fi permanently
#   - Disables sleep/suspend/hibernate (critical for headless server)
#   - Enables automatic security updates
#   - Configures fail2ban for SSH protection
#
# What it does NOT do (must be done manually):
#   - Set static IP in /etc/network/interfaces (interface name varies)
#   - Install PowerPanel UPS software (requires .deb download from CyberPower website)
#   - Clone the repository or create .env / Caddyfile
#   - Configure WireGuard keys and wg0.conf (requires key exchange with Mac peer)
#   - Run wg-quick up wg0 (requires config to be in place first)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[NUC-SETUP]${NC} $*"; }
warn() { echo -e "${YELLOW}[NUC-SETUP WARN]${NC} $*"; }
error() { echo -e "${RED}[NUC-SETUP ERROR]${NC} $*" >&2; exit 1; }

# ── Guards ────────────────────────────────────────────────────────────────────

check_root() {
    [[ $EUID -eq 0 ]] || error "Run as root: sudo bash $0"
}

check_debian12() {
    [[ -f /etc/os-release ]] || error "Cannot detect OS"
    source /etc/os-release
    [[ "$ID" == "debian" && "$VERSION_ID" == "12" ]] \
        || error "Requires Debian 12 (Bookworm). Found: ${PRETTY_NAME:-unknown}"
    log "OS: $PRETTY_NAME"
}

# ── System Update ─────────────────────────────────────────────────────────────

update_system() {
    log "Updating system packages..."
    apt-get update -qq
    apt-get upgrade -y -qq
}

# ── Package Installation ──────────────────────────────────────────────────────

install_packages() {
    log "Installing required packages..."
    apt-get install -y -qq \
        docker.io \
        docker-compose \
        git \
        curl \
        wget \
        vim \
        nano \
        htop \
        iotop \
        rsync \
        rclone \
        net-tools \
        dnsutils \
        iputils-ping \
        openssl \
        ca-certificates \
        gnupg \
        lsb-release \
        rfkill \
        usbutils \
        smartmontools \
        logrotate \
        cron \
        unattended-upgrades \
        fail2ban \
        ufw \
        openssh-server \
        xxd
    log "Packages installed"
}

# ── Docker ────────────────────────────────────────────────────────────────────

configure_docker() {
    log "Configuring Docker..."
    systemctl enable docker
    systemctl start docker

    if id "admin" &>/dev/null; then
        usermod -aG docker admin
        log "Added 'admin' to docker group (re-login required)"
    fi

    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json << 'EOF'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2"
}
EOF
    systemctl restart docker
    log "Docker configured"
}

# ── Wi-Fi Disable ─────────────────────────────────────────────────────────────

disable_wifi() {
    log "Disabling Wi-Fi..."
    rfkill block wifi 2>/dev/null || true

    # Blacklist common Wi-Fi kernel modules to persist across reboots
    cat > /etc/modprobe.d/blacklist-wifi.conf << 'EOF'
# Disable Wi-Fi — NUC uses wired Ethernet only
blacklist iwlwifi
blacklist cfg80211
blacklist mac80211
EOF
    log "Wi-Fi disabled and blacklisted"
}

# ── Firewall ──────────────────────────────────────────────────────────────────

configure_firewall() {
    log "Configuring UFW firewall..."
    ufw --force reset

    ufw default deny incoming
    ufw default allow outgoing

    # SSH: WireGuard VPN subnet + local LAN only (port 22 never exposed publicly)
    ufw allow from 10.8.0.0/24 to any port 22 comment 'WireGuard VPN SSH'
    ufw allow from 192.168.1.0/24 to any port 22 comment 'Local network SSH'

    # WireGuard VPN (public-facing UDP port)
    ufw allow 51820/udp comment 'WireGuard VPN'

    # HTTP/HTTPS for Caddy
    ufw allow 80/tcp comment 'HTTP (Caddy)'
    ufw allow 443/tcp comment 'HTTPS (Caddy)'

    ufw --force enable
    log "Firewall configured"
    ufw status
}

# ── Fail2ban ──────────────────────────────────────────────────────────────────

configure_fail2ban() {
    log "Configuring fail2ban..."
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
    systemctl enable fail2ban
    systemctl restart fail2ban
    log "fail2ban configured"
}

# ── Automatic Security Updates ────────────────────────────────────────────────

configure_auto_updates() {
    log "Enabling automatic security updates..."
    cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
    log "Automatic security updates enabled"
}

# ── WireGuard ─────────────────────────────────────────────────────────────────

install_wireguard() {
    if command -v wg &>/dev/null; then
        log "WireGuard already installed: $(wg --version 2>&1 | head -1)"
        return
    fi
    log "Installing WireGuard..."
    apt-get install -y -qq wireguard
    log "WireGuard installed. Key generation and wg0.conf setup must be done manually."
    log "See docs/NUC_DEPLOYMENT.md Phase 2.5 for full WireGuard configuration steps."
}

# ── SSH Hardening ─────────────────────────────────────────────────────────────

harden_ssh() {
    log "Hardening SSH configuration..."
    cat > /etc/ssh/sshd_config.d/99-nuc-hardening.conf << 'EOF'
# NUC production hardening
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
X11Forwarding no
AllowTcpForwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
    systemctl restart ssh
    log "SSH hardened (key-based auth only, root login disabled)"
    warn "Ensure your SSH public key is in /home/admin/.ssh/authorized_keys before logging out!"
}

# ── Disable Sleep / Suspend ──────────────────────────────────────────────────

disable_sleep() {
    log "Disabling sleep, suspend, and hibernate..."

    # Mask all systemd sleep targets
    systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

    # Configure logind to ignore idle and lid events
    local logind_conf="/etc/systemd/logind.conf"
    # Only add if not already set
    grep -q '^HandleLidSwitch=' "$logind_conf" \
        || echo 'HandleLidSwitch=ignore' >> "$logind_conf"
    grep -q '^HandleLidSwitchExternalPower=' "$logind_conf" \
        || echo 'HandleLidSwitchExternalPower=ignore' >> "$logind_conf"
    grep -q '^IdleAction=' "$logind_conf" \
        || echo 'IdleAction=ignore' >> "$logind_conf"
    grep -q '^IdleActionSec=' "$logind_conf" \
        || echo 'IdleActionSec=0' >> "$logind_conf"

    systemctl restart systemd-logind
    log "Sleep/suspend disabled"
}

# ── Swap (safety net for memory pressure) ─────────────────────────────────────

configure_swap() {
    if swapon --show | grep -q '/swapfile'; then
        log "Swap already configured"
        return
    fi
    log "Configuring 2GB swap file..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Reduce swappiness for a server (prefer RAM)
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    sysctl -p
    log "Swap configured (2GB, swappiness=10)"
}

# ── Summary ───────────────────────────────────────────────────────────────────

print_next_steps() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  NUC Setup Complete${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Next steps (manual):"
    echo ""
    echo "1. Set static IP in /etc/network/interfaces:"
    echo "   - Find interface: ip link show"
    echo "   - Edit: sudo nano /etc/network/interfaces"
    echo "   - Set address 192.168.1.50, gateway 192.168.1.1"
    echo "   - Restart: sudo systemctl restart networking"
    echo ""
    echo "2. Configure WireGuard (see docs/NUC_DEPLOYMENT.md Phase 2.5):"
    echo "   a. Generate NUC key pair:"
    echo "      cd /etc/wireguard && umask 077"
    echo "      wg genkey | sudo tee nuc_private.key | wg pubkey | sudo tee nuc_public.key"
    echo "   b. Create /etc/wireguard/wg0.conf with NUC address 10.8.0.1/24"
    echo "   c. Exchange public keys with your Mac peer"
    echo "   d. sudo systemctl enable wg-quick@wg0 && sudo systemctl start wg-quick@wg0"
    echo ""
    echo "3. Add your SSH public key:"
    echo "   mkdir -p /home/admin/.ssh"
    echo "   echo 'ssh-ed25519 AAAA...' >> /home/admin/.ssh/authorized_keys"
    echo "   chmod 700 /home/admin/.ssh && chmod 600 /home/admin/.ssh/authorized_keys"
    echo "   chown -R admin:admin /home/admin/.ssh"
    echo ""
    echo "4. Connect UPS and install PowerPanel (CyberPower GX1500U):"
    echo "   a. Connect USB-A to USB-B cable:"
    echo "      - UPS end: USB-B port on back of GX1500U"
    echo "      - NUC end: rear USB 2.0 Type-A port (the single USB 2.0 on the back panel)"
    echo "   b. Verify NUC sees the UPS: lsusb | grep -i cyber"
    echo "   c. Download PowerPanel .deb (on your Mac):"
    echo "      https://www.cyberpower.com/global/en/product/sku/powerpanel_personal_for_linux"
    echo "   d. Transfer to NUC: scp ~/Downloads/powerpanel-*.deb admin@10.8.0.1:/tmp/"
    echo "   e. Install: sudo dpkg -i /tmp/powerpanel-*.deb"
    echo "   f. sudo systemctl enable pwrstatd && sudo systemctl start pwrstatd"
    echo "   g. sudo pwrstat -status  (verify State: Normal)"
    echo "   See docs/NUC_DEPLOYMENT.md Phase 2.7 for full config and auto-shutdown setup."
    echo ""
    echo "5. Clone repository and create .env + Caddyfile:"
    echo "   See docs/NUC_DEPLOYMENT.md Phase 4"
    echo ""
    echo "6. Configure router port forwarding (ports 80, 443 → 192.168.1.50)"
    echo "   Power cycle router first (unplug 30 seconds)"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    check_root
    check_debian12
    update_system
    install_packages
    configure_docker
    disable_wifi
    configure_firewall
    configure_fail2ban
    configure_auto_updates
    install_wireguard
    harden_ssh
    disable_sleep
    configure_swap
    print_next_steps
}

main "$@"
