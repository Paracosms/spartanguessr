import Logo from "../assets/SpartanguessrLogo.png";
import Helmet from "../assets/icons/Helmet.png";
import Spear from "../assets/icons/WebIcon.png";
import { Link } from "react-router-dom";

const demoTeam = [
    { name: "AJ", color: "#ed8796" },
    { name: "Brian", color: "#eed49f" },
    { name: "William", color: "#a6da95" },
    { name: "Ngoc", color: "#8aadf4" },
];

export default function AboutPanel() {
    return (
        <section
            className="about-panel"
            id="landing-panel"
            role="tabpanel"
            aria-labelledby="landing-tab-about"
        >
            <img className="about-logo" src={Logo} alt="SpartanGuessr" />
            <div className="about-section">
                <strong>Special thanks to the original team for helping with the game's demo:</strong>
                <div className="about-team-list" aria-label="Original demo team">
                    {demoTeam.map((member, index) => (
                        <span key={member.name} className="about-team-member">
                            {index > 0 && "·"}
                            <strong style={{ color: member.color }}>{member.name}</strong>
                        </span>
                    ))}
                </div>
            </div>
            <div className="about-creator-stage">
                <img className="about-creator-spear" src={Spear} alt="" aria-hidden="true" />
                <div className="about-creator">
                    <span>Created by:</span>
                    <strong>Andrew</strong>
                </div>
                <img className="about-creator-helmet" src={Helmet} alt="" aria-hidden="true" />
            </div>
            <div className="about-section about-contribute-section">
                <strong>Contribute / Feedback</strong>
            </div>
            <p className="about-links about-contribute-section">
                <Link to="/map">Submit Photos</Link>
                <span aria-hidden="true">·</span>
                <a href="mailto:andrew.hiponia@sjsu.edu?subject=SpartanGuessr%20Issue">Report an Issue</a>
            </p>
        </section>
    );
}
