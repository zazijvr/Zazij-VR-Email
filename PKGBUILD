# Maintainer: Zazij VR <sefin@example.com>
pkgname=zazijvr-email
pkgver=1.0.0
pkgrel=1
pkgdesc="Zažij VR - Modern Linux Email & Calendar Client"
arch=('x86_64')
url="https://github.com/zazijvr/Zazij-VR-Email"
license=('custom')
depends=('webkit2gtk' 'gtk3' 'cairo' 'pango' 'glib2')
makedepends=('npm' 'rust' 'cargo' 'nodejs')
source=("git+https://github.com/zazijvr/Zazij-VR-Email.git#branch=main")
sha256sums=('SKIP')

build() {
  cd "$srcdir/Zazij-VR-Email"
  
  export WEBKIT_DISABLE_DMABUF_RENDERER=1
  
  # Install node dependencies
  npm install
  
  # Build tauri native debian bundle
  npx tauri build --bundles deb
}

package() {
  cd "$srcdir/Zazij-VR-Email"
  
  # Extract the deb package built by Tauri
  local deb_file=$(find src-tauri/target/release/bundle/deb -name "*.deb" | head -n 1)
  
  if [ -z "$deb_file" ]; then
    echo "ERROR: Could not find generated .deb package"
    exit 1
  fi
  
  # Extract the .deb file directly into pkgdir
  bsdtar -xf "$deb_file" -C "$pkgdir/" data.tar.gz
  bsdtar -xf "$pkgdir/data.tar.gz" -C "$pkgdir/"
  rm -f "$pkgdir/data.tar.gz"

  # Natively on linux, the binary location might need to be verified,
  # but Tauri's deb bundle puts it properly in /usr/bin/ and /usr/share/ etc.
}
