// @ts-nocheck
import "./Home.scss";
import { useDispatch, useSelector } from "react-redux";
import { fetchProducts } from "../../store/slices/productSlice";
import React, { useEffect, useState } from "react";
import { Container, Button, Card, Row, Col, Badge } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import { useNavigate } from "react-router-dom";
import banner from "../../assets/banner.jpg";
import { Carousel } from "react-bootstrap";
import { FaArrowRight, FaShippingFast, FaEnvelope } from "react-icons/fa";
import { getActiveBannerService } from "../../services/bannerService";
import { toast } from "react-toastify";

const Home = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<any>();
  const { products, status, error } = useSelector((state: any) => state.product);
  const [banners, setBanners] = useState([]);
  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchProducts());
    }
  }, [status, dispatch]);
  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const response = await getActiveBannerService();

        const parsed = response.data.DT.map((banner) => ({
          ...banner,
          image:
            typeof banner.image === "string"
              ? JSON.parse(banner.image)
              : banner.image,
        }));

        setBanners(parsed);
      } catch (error) {
        console.error("Lỗi khi lấy banner:", error);
        toast.error("Không thể lấy danh sách banner.");
      }
    };

    fetchBanners();
  }, []);

  if (status === "loading") return <p>Loading...</p>;
  if (status === "failed") return <p>Error: {error}</p>;

  const getProductImages = (images) => {
    if (!images) return [];
    let parsedImages = [];

    try {
      parsedImages = JSON.parse(images);
      if (typeof parsedImages === "string") {
        parsedImages = JSON.parse(parsedImages);
      }
    } catch (error) {
      console.error("Lỗi parse JSON:", error);
      return [];
    }

    if (!Array.isArray(parsedImages)) return [];

    return parsedImages
      .map((item) => {
        if (!item) return null;
        if (typeof item === "string") {
          return { url: item };
        }
        if (item.url) {
          return { url: item.url };
        }
        return null;
      })
      .filter(Boolean);
  };

  const features = [
    {
      title: "Chính sách đổi trả dễ dàng",
      description: "Chúng tôi cung cấp chính sách đổi trả đơn giản",
      image:
        "https://storage.googleapis.com/a1aa/image/2CGMyx7fyTDulaPJHARdvWZ_zQiBE-rLw1tg2UnQLaQ.jpg",
      alt: "Icon representing easy exchange policy",
    },
    {
      title: "Chính sách hoàn trả 7 ngày",
      description:
        "Chúng tôi cung cấp chính sách hoàn trả miễn phí trong 7 ngày",
      image:
        "https://storage.googleapis.com/a1aa/image/k8AwidVjew1i_xx08ROkpZ-jKPkxRG0ofvtngy36364.jpg",
      alt: "Icon representing 7 days return policy",
    },
    {
      title: "Hỗ trợ khách hàng tốt nhất",
      description: "Chúng tôi cung cấp hỗ trợ khách hàng 24/7",
      image:
        "https://storage.googleapis.com/a1aa/image/6egWY7aDLqb4L75DRuOxno1hkTs-3iU_Lt5RurBujk0.jpg",
      alt: "Icon representing best customer support",
    },
  ];

  return (
    <div className="home-container">
      <Container fluid className="p-0">
        {/* Enhanced Banner Carousel */}
        <div className="banner-carousel-container">
          <Carousel slide interval={3000} className="main-carousel">
            {banners.map((banner) => (
              <Carousel.Item
                key={banner.id}
                onClick={() => navigate(banner.url)}
                style={{ cursor: "pointer" }}
              >
                <div className="carousel-image-container">
                  <img
                    className="d-block w-100"
                    src={banner.image?.url || ""}
                    alt={banner.name}
                    style={{ objectFit: "cover", height: "600px" }}
                  />
                  <div className="carousel-overlay"></div>
                </div>
                <Carousel.Caption className="carousel-caption-enhanced">
                  <h2
                    className="banner-title"
                    style={{
                      fontSize: "2rem",
                      marginBottom: "1rem",
                      transform: "translateY(20px)",
                    }}
                  >
                    {banner.name}
                  </h2>
                </Carousel.Caption>
              </Carousel.Item>
            ))}
          </Carousel>
        </div>
      </Container>

      <section className="py-12" style={{ background: "#f8f9fa" }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-8 px-4">
          {/* Left text */}
          <div className="flex-1 space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-800">
              Hàng Mới Về
            </h1>
            <p className="text-gray-600 leading-relaxed">
              Khám phá những xu hướng và phong cách mới nhất được thêm vào bộ
              sưu tập của chúng tôi. Hãy là người đầu tiên khám phá những sản
              phẩm mới và tìm kiếm món đồ yêu thích tiếp theo của bạn!
            </p>
            <button
              onClick={() => navigate("/products")}
              className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 rounded-md hover:bg-gray-800 transition"
            >
              <span>MUA NGAY</span>
              <FaArrowRight />
            </button>
          </div>

          {/* Right image */}
          <div className="flex-1 relative group overflow-hidden rounded-lg shadow-lg">
            <img
              src={banner}
              alt="Hàng Mới Về"
              className="w-full h-96 object-cover transform group-hover:scale-105 transition duration-500"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              <button
                onClick={() => navigate("/products")}
                className="bg-white text-black font-semibold px-6 py-2 rounded-full"
              >
                Khám Phá Ngay
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Product Sections with Enhanced Cards */}
      <div className="py-5" style={{ background: "#ffffff" }}>
        <Container>
          <div className="section-heading text-center mb-5">
            <h2 className="display-5 fw-bold">BỘ SƯU TẬP MỚI NHẤT</h2>
            <div className="heading-underline mx-auto"></div>
          </div>

          <div className="product-grid">
            {products.slice(0, 10).map((product) => {
              const images = getProductImages(product.images);
              return (
                <Card
                  key={product.id}
                  className="product-card shadow-sm border-0 h-100"
                  onClick={() => navigate(`/product/${product.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="card-img-wrapper">
                    <div style={{ height: "250px", overflow: "hidden" }}>
                      <Card.Img
                        variant="top"
                        src={images[0]?.url || ""}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          transition: "transform 0.5s ease",
                        }}
                        className="product-image"
                      />
                    </div>
                    <div className="card-hover-overlay">
                      <Button variant="light" className="quick-view-btn">
                        Xem Chi Tiết
                      </Button>
                    </div>
                  </div>
                  <Card.Body className="text-center">
                    <Card.Title className="product-title">
                      {product.name}
                    </Card.Title>
                    <Card.Text className="product-price fw-bold">
                      {product.price.toLocaleString()} VND
                    </Card.Text>
                  </Card.Body>
                </Card>
              );
            })}
          </div>

          <div className="text-center mt-4">
            <Button
              variant="outline-dark"
              size="lg"
              onClick={() => navigate("/products")}
              className="view-all-btn"
            >
              XEM TẤT CẢ
            </Button>
          </div>
        </Container>
      </div>

      <Container className="py-5">
        <div className="section-heading text-center mb-5">
          <h2 className="display-5 fw-bold">SẢN PHẨM BÁN CHẠY</h2>
          <div className="heading-underline mx-auto"></div>
          <p className="lead text-muted mt-3">
            Những sản phẩm phổ biến nhất của chúng tôi dựa trên doanh số
          </p>
        </div>

        <div className="product-grid">
          {products.slice(0, 10).map((product, index) => {
            const images = getProductImages(product.images);
            return (
              <Card
                key={product.id}
                className="product-card shadow-sm border-0 h-100"
                onClick={() => navigate(`/product/${product.id}`)}
                style={{ cursor: "pointer" }}
              >
                {index < 3 && (
                  <Badge
                    bg="danger"
                    className="position-absolute top-0 start-0 m-2 z-index-1 px-2 py-1"
                  >
                    Top {index + 1}
                  </Badge>
                )}
                <div className="card-img-wrapper">
                  <div style={{ height: "250px", overflow: "hidden" }}>
                    <Card.Img
                      variant="top"
                      src={images[0]?.url || ""}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transition: "transform 0.5s ease",
                      }}
                      className="product-image"
                    />
                  </div>
                  <div className="card-hover-overlay">
                    <Button variant="light" className="quick-view-btn">
                      Xem Chi Tiết
                    </Button>
                  </div>
                </div>
                <Card.Body className="text-center">
                  <Card.Title className="product-title">
                    {product.name}
                  </Card.Title>
                  <Card.Text className="product-price fw-bold">
                    {product.price.toLocaleString()} VND
                  </Card.Text>
                </Card.Body>
              </Card>
            );
          })}
        </div>
      </Container>

      {/* Enhanced Features Section */}
      <div className="py-5" style={{ background: "#f8f9fa" }}>
        <Container>
          <Row className="text-center mb-5 g-4">
            {features.map((feature, index) => (
              <Col
                key={index}
                md={4}
                className="d-flex flex-column align-items-center feature-card"
              >
                <div className="feature-icon-container mb-3">
                  <img
                    src={feature.image}
                    alt={feature.alt}
                    width="64"
                    height="64"
                  />
                </div>
                <h3 className="fs-4 fw-bold mb-2">{feature.title}</h3>
                <p className="text-muted px-4">{feature.description}</p>
              </Col>
            ))}
          </Row>
        </Container>
      </div>
    </div>
  );
};

export default Home;
