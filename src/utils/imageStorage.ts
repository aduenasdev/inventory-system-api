import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// Directorio de uploads
export const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');

// Asegurar que existe el directorio
export async function ensureUploadsDir() {
  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

// Configuración de Multer (memoria temporal)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024, // 500 KB máximo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG y WebP'));
    }
  },
});

// Procesar y guardar imagen (original + thumbnail)
export async function processAndSaveImage(
  productId: number,
  buffer: Buffer
): Promise<{ imageUrl: string; thumbnailUrl: string }> {
  await ensureUploadsDir();

  const imagePath = path.join(UPLOADS_DIR, `${productId}.webp`);
  const thumbnailPath = path.join(UPLOADS_DIR, `${productId}_thumb.webp`);

  // Guardar imagen original en WebP (mejor compresión)
  await sharp(buffer)
    .webp({ quality: 85 })
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .toFile(imagePath);

  // Generar thumbnail
  await sharp(buffer)
    .webp({ quality: 75 })
    .resize(150, 150, { fit: 'cover' })
    .toFile(thumbnailPath);

  return {
    imageUrl: `/uploads/products/${productId}.webp`,
    thumbnailUrl: `/uploads/products/${productId}_thumb.webp`,
  };
}

// Eliminar imágenes de un producto
export async function deleteProductImages(productId: number): Promise<void> {
  const imagePath = path.join(UPLOADS_DIR, `${productId}.webp`);
  const thumbnailPath = path.join(UPLOADS_DIR, `${productId}_thumb.webp`);

  try {
    await fs.unlink(imagePath);
  } catch {}
  
  try {
    await fs.unlink(thumbnailPath);
  } catch {}
}
