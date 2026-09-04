export const checkRole = (...allowedRoles) => {
    return (req, res, next) => {
        const user = req.user; // req.user đã được gắn bởi verifyToken
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!allowedRoles.includes(user.role)) {
            return res
                .status(403)
                .json({ message: "Forbidden: Access denied" });
        }

        next();
    };
};
