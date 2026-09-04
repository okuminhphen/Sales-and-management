import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
        let folder = "others";

        if (file.fieldname === "images") folder = "products";
        if (file.fieldname === "avatar") folder = "avatars";
        if (file.fieldname === "banner") folder = "banners";

        return {
            folder,
            allowed_formats: ["jpg", "png", "jpeg", "webp"],
        };
    },
});

const upload = multer({ storage });

export default upload;
