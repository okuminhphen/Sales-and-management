import { Container, Row, Col } from "react-bootstrap";

const Footer = () => {
  return (
    <footer className="bg-dark text-light py-4">
      <Container>
        <Row>
          <Col md={4}>
            <h5>About us</h5>
            <p>HappyShop</p>
          </Col>
          <Col md={4}>
            <h5>Liên Kết</h5>
            <ul className="list-unstyled">
              <li>
                <a href="/" className="text-light">
                  Trang chủ
                </a>
              </li>
              <li>
                <a href="/products" className="text-light">
                  Sản phẩm
                </a>
              </li>
              <li>
                <a href="/contact" className="text-light">
                  Liên hệ
                </a>
              </li>
            </ul>
          </Col>
          <Col md={4}>
            <h5>Theo dõi chúng tôi</h5>
            <div>
              <a
                href="https://www.facebook.com/phung.2003"
                className="text-light me-3"
              >
                <i className="fab fa-facebook"></i>
              </a>
              <a href="#" className="text-light me-3">
                <i className="fab fa-instagram"></i>
              </a>
              <a
                href="https://www.youtube.com/@senachill"
                className="text-light"
              >
                <i className="fab fa-youtube"></i>
              </a>
            </div>
          </Col>
        </Row>
        <hr />
        <p className="text-center mb-0">
          © 2025 PC Store. All rights reserved.
        </p>
      </Container>
    </footer>
  );
};

export default Footer;
